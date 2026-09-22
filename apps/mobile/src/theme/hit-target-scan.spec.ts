import {
  MIN_HIT_TARGET,
  PRESSABLE_TAGS,
  extractStyles,
  hitSlopOf,
  hitTargetViolations,
  scanPressables,
  styleSize,
} from './hit-target-scan';

/**
 * Сам разбор — на выдуманных кусках кода, а не на настоящих экранах: сторож
 * из `hit-target.spec.ts` полезен ровно настолько, насколько разбор не врёт, и
 * проверять его на живом дереве значило бы проверять сторожем сторожа. Здесь
 * оба исхода видны явно: и занижение, которое он обязан поймать, и то, что он
 * обязан пропустить, не подняв ложную тревогу.
 */

const file = (jsx: string, styles: string) => `
import { Pressable, StyleSheet, View } from 'react-native';
import { hitTarget } from '@/theme/tokens';
export function Screen() {
  return (${jsx});
}
const styles = StyleSheet.create({${styles}});
`;

describe('extractStyles', () => {
  it('разбирает стили верхнего уровня и не путается во вложенных объектах', () => {
    const styles = extractStyles(
      `const styles = StyleSheet.create({
        card: { minHeight: 44, shadowOffset: { width: 0, height: 2 } },
        text: { fontSize: 13 },
      });`,
    );
    expect([...styles.keys()]).toEqual(['card', 'text']);
    expect(styles.get('card')).toContain('minHeight: 44');
  });

  it('файл без StyleSheet отдаёт пустую карту, а не падает', () => {
    expect(extractStyles('export const a = 1;').size).toBe(0);
  });
});

describe('styleSize', () => {
  it('различает токен и число и берёт наименьшее по каждой оси', () => {
    expect(styleSize('minHeight: hitTarget, minWidth: 64')).toEqual({
      kind: 'token',
      height: null,
      width: 64,
    });
    expect(styleSize('height: 30, width: 80')).toEqual({ kind: 'number', height: 30, width: 80 });
    expect(styleSize('paddingVertical: 10')).toEqual({ kind: 'none', height: null, width: null });
  });

  // `borderRadius: 14` и `lineHeight: 16` — не размеры зоны нажатия, и
  // считать их занижением значило бы завалить тест ложной тревогой.
  it('похожие по написанию свойства размерами не считает', () => {
    expect(styleSize('borderRadius: 14, lineHeight: 16, maxHeight: 20').kind).toBe('none');
  });
});

describe('hitSlopOf', () => {
  it('читает число и объект, по осям раздельно', () => {
    expect(hitSlopOf('<Pressable hitSlop={8} />')).toEqual({ vertical: 16, horizontal: 16 });
    expect(hitSlopOf('<Pressable hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }} />')).toEqual({
      vertical: 16,
      horizontal: 12,
    });
    expect(hitSlopOf('<Pressable onPress={go} />')).toEqual({ vertical: 0, horizontal: 0 });
  });

  // Значение из переменной прочитать нельзя — считаем нулём и требуем числа
  // рядом с кнопкой, а не верим на слово.
  it('значение из переменной не засчитывается', () => {
    expect(hitSlopOf('<Pressable hitSlop={SLOP} />')).toEqual({ vertical: 0, horizontal: 0 });
  });
});

describe('scanPressables', () => {
  it('ловит занижение высоты у кнопки', () => {
    const items = scanPressables(
      file('<Pressable onPress={go} style={styles.chip} />', 'chip: { minHeight: 30 },'),
    );
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ tag: 'Pressable', kind: 'number', smallest: 30 });
    expect(hitTargetViolations(items)).toHaveLength(1);
  });

  it('размер из токена нарушением не считает', () => {
    const items = scanPressables(
      file('<Pressable onPress={go} style={styles.chip} />', 'chip: { minHeight: hitTarget },'),
    );
    expect(items[0].kind).toBe('token');
    expect(hitTargetViolations(items)).toEqual([]);
  });

  it('маленький значок с hitSlop до порога — не нарушение', () => {
    const items = scanPressables(
      file(
        '<Pressable onPress={go} hitSlop={{ top: 8, bottom: 8 }} style={styles.chip} />',
        'chip: { minHeight: 28, minWidth: hitTarget },',
      ),
    );
    expect(items[0].smallest).toBe(44);
    expect(hitTargetViolations(items)).toEqual([]);
  });

  it('hitSlop, не добирающий до порога, не спасает', () => {
    const items = scanPressables(
      file(
        '<Pressable onPress={go} hitSlop={{ top: 2, bottom: 2 }} style={styles.chip} />',
        'chip: { minHeight: 28 },',
      ),
    );
    expect(hitTargetViolations(items)[0].smallest).toBe(32);
  });

  // Размер значка ВНУТРИ кнопки к зоне нажатия отношения не имеет: счётчик
  // непрочитанного (20) висит внутри кнопки с `minHeight: hitTarget`.
  it('стили содержимого кнопки за её размер не принимает', () => {
    const items = scanPressables(
      file(
        `<Pressable onPress={go} style={styles.button}>
           <View style={styles.badge} />
         </Pressable>`,
        'button: { minHeight: hitTarget }, badge: { width: 20, height: 20 },',
      ),
    );
    expect(hitTargetViolations(items)).toEqual([]);
  });

  it('видит стиль внутри массива и функции по нажатию', () => {
    const items = scanPressables(
      file(
        '<Pressable onPress={go} style={({ pressed }) => [styles.row, pressedStyle(pressed)]} />',
        'row: { height: 20 },',
      ),
    );
    expect(hitTargetViolations(items)[0].smallest).toBe(20);
  });

  it('нажимаемое без объявленного размера тревоги не поднимает', () => {
    const items = scanPressables(
      file('<Pressable onPress={go} style={styles.link} />', 'link: { paddingVertical: 12 },'),
    );
    expect(items[0]).toMatchObject({ kind: 'none', smallest: null });
    expect(hitTargetViolations(items)).toEqual([]);
  });

  // Сокращённый список тегов — тихая дыра: элемент просто перестаёт
  // попадаться разбору, и сторож рапортует «нарушений нет».
  it.each([...PRESSABLE_TAGS])('узнаёт %s, а не только Pressable', (tag) => {
    const items = scanPressables(
      file(`<${tag} onPress={go} style={styles.chip} />`, 'chip: { height: 24 },'),
    );
    expect(items[0]?.tag).toBe(tag);
    expect(hitTargetViolations(items)).toHaveLength(1);
  });

  it('список нажимаемых тегов не сокращается молча', () => {
    expect([...PRESSABLE_TAGS]).toEqual([
      'Pressable',
      'TouchableOpacity',
      'TouchableHighlight',
      'TouchableWithoutFeedback',
    ]);
  });

  it('обычные View нажимаемыми не считает', () => {
    expect(scanPressables(file('<View style={styles.row} />', 'row: { height: 20 },'))).toEqual([]);
  });
});

describe('порог', () => {
  it('равен 44 — правило пользователя, а не догадка', () => {
    expect(MIN_HIT_TARGET).toBe(44);
  });
});
