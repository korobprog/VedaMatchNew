/**
 * Разбор исходника экрана: какая зона нажатия получается у нажимаемых
 * элементов.
 *
 * Зачем это вообще. Правило «зона нажатия не меньше 44» соблюдалось на глаз:
 * токен `hitTarget` в теме есть, но ничто не мешало написать рядом `minHeight:
 * 30`, и ни один тест бы не заметил (раунд оценки VED-333, итерация 1 —
 * проверяющий занизил токен в `check-row.tsx`, и `jest` остался зелёным).
 * Контраст в этом репозитории сторожится ровно так же — списком реальных пар
 * в `contrast.spec.ts`; здесь тот же приём, только исходный материал не цвета,
 * а текст экранов.
 *
 * Разбор нарочно текстовый и узкий: он опознаёт ровно ту раскладку, в которой
 * написано всё приложение, — `<Pressable style={[styles.имя, …]}>` плюс
 * `StyleSheet.create` в конце файла. Лишнего он не выдумывает: элемент, у
 * которого размер задаётся не числом и не токеном, а отступами, помечается
 * «размер не объявлен» и провалом НЕ считается. Поэтому тест рядом
 * дополнительно сторожит охват — сколько элементов разбор вообще узнал: без
 * этого достаточно было бы испортить регулярку, чтобы «нарушений нет».
 */

/** Ниже этого зону нажатия не опускаем. То же число, что `hitTarget` в `tokens.ts`. */
export const MIN_HIT_TARGET = 44;

/** Теги, нажатие по которым обрабатывается самим элементом. */
export const PRESSABLE_TAGS = [
  'Pressable',
  'TouchableOpacity',
  'TouchableHighlight',
  'TouchableWithoutFeedback',
] as const;

const HEIGHT_PROPS = ['minHeight', 'height'] as const;
const WIDTH_PROPS = ['minWidth', 'width'] as const;

export type SizeKind =
  /** Размер взят из токена темы (`hitTarget`) — так и надо. */
  | 'token'
  /** Размер задан числом. */
  | 'number'
  /** Размер не объявлен вовсе: высоту даёт содержимое и отступы. */
  | 'none';

export interface PressableSize {
  tag: string;
  /** Строка исходника, 1-based — чтобы сообщение теста вело прямо к месту. */
  line: number;
  /** Имена стилей из `styles.*`, попавшие в проп `style` самого элемента. */
  styles: string[];
  kind: SizeKind;
  /**
   * Наименьшая объявленная зона нажатия с учётом `hitSlop`; `null` — размер
   * числом не объявлен, и судить по исходнику не о чем.
   */
  smallest: number | null;
}

export interface HitTargetViolation extends PressableSize {
  smallest: number;
}

/**
 * Тело `StyleSheet.create({...})` по именам стилей. Скобки считаются, а не
 * ищутся регуляркой: во вложенных объектах (`shadowOffset`) она обрывалась бы
 * на первой же закрывающей.
 */
export function extractStyles(source: string): Map<string, string> {
  const result = new Map<string, string>();
  const start = source.indexOf('StyleSheet.create(');
  if (start === -1) return result;
  const objectStart = source.indexOf('{', start);
  if (objectStart === -1) return result;

  let depth = 0;
  let objectEnd = -1;
  for (let index = objectStart; index < source.length; index += 1) {
    const char = source[index];
    if (char === '{') depth += 1;
    else if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        objectEnd = index;
        break;
      }
    }
  }
  if (objectEnd === -1) return result;

  const body = source.slice(objectStart + 1, objectEnd);
  // Верхний уровень объекта: `имя: { … },` — разбираем тем же счётчиком скобок.
  const keyPattern = /(^|[,\n])\s*([A-Za-z_][A-Za-z0-9_]*)\s*:\s*\{/g;
  let match: RegExpExecArray | null;
  while ((match = keyPattern.exec(body)) !== null) {
    const braceStart = body.indexOf('{', match.index + match[0].length - 1);
    let level = 0;
    for (let i = braceStart; i < body.length; i += 1) {
      if (body[i] === '{') level += 1;
      else if (body[i] === '}') {
        level -= 1;
        if (level === 0) {
          const name = match[2];
          // Вложенные объекты (`shadowOffset: { width: 0 }`) верхним уровнем
          // не считаются: до них курсор регулярки уже не дойдёт.
          if (!result.has(name)) result.set(name, body.slice(braceStart + 1, i));
          keyPattern.lastIndex = i;
          break;
        }
      }
    }
  }
  return result;
}

function smallestOf(body: string, props: readonly string[]): { kind: SizeKind; smallest: number | null } {
  let kind: SizeKind = 'none';
  let smallest: number | null = null;
  for (const prop of props) {
    const found = new RegExp(`(?:^|[,{\\s])${prop}\\s*:\\s*([A-Za-z0-9_.]+)`, 'g');
    let match: RegExpExecArray | null;
    while ((match = found.exec(body)) !== null) {
      const raw = match[1];
      if (/^[0-9]+(\.[0-9]+)?$/.test(raw)) {
        const value = Number(raw);
        smallest = smallest === null ? value : Math.min(smallest, value);
        if (kind !== 'token') kind = 'number';
      } else if (raw === 'hitTarget' || raw.endsWith('.hitTarget')) {
        kind = 'token';
      }
    }
  }
  return { kind, smallest };
}

/** Размеры одного стиля: по высоте и по ширине отдельно — `hitSlop` тоже разный по осям. */
export function styleSize(body: string): {
  kind: SizeKind;
  height: number | null;
  width: number | null;
} {
  const height = smallestOf(body, HEIGHT_PROPS);
  const width = smallestOf(body, WIDTH_PROPS);
  const kind: SizeKind =
    height.kind === 'token' || width.kind === 'token'
      ? 'token'
      : height.kind === 'number' || width.kind === 'number'
        ? 'number'
        : 'none';
  return { kind, height: height.smallest, width: width.smallest };
}

/**
 * Насколько `hitSlop` расширяет зону нажатия по каждой оси.
 *
 * `hitSlop` — штатный способ React Native оставить значок маленьким, а палец
 * ловить по-крупному; для правила «не меньше 44» он равноправен с размером.
 * Читаются только литералы: `hitSlop={8}` и `hitSlop={{ top: 8, bottom: 8 }}`.
 * Значение из переменной прочитать нельзя, и оно считается нулём — пусть
 * лучше тест потребует написать число рядом с кнопкой, чем молча поверит.
 */
export function hitSlopOf(tag: string): { vertical: number; horizontal: number } {
  const match = tag.match(/\bhitSlop\s*=\s*\{\s*([\s\S]*?)\}\s*(?=\n|\s[a-zA-Z]|\/?>)/);
  if (!match) return { vertical: 0, horizontal: 0 };
  const raw = match[1].trim();
  if (/^[0-9]+(\.[0-9]+)?$/.test(raw)) {
    const value = Number(raw);
    return { vertical: value * 2, horizontal: value * 2 };
  }
  const side = (name: string): number => {
    const found = raw.match(new RegExp(`\\b${name}\\s*:\\s*([0-9]+(?:\\.[0-9]+)?)`));
    return found ? Number(found[1]) : 0;
  };
  return { vertical: side('top') + side('bottom'), horizontal: side('left') + side('right') };
}

/** Открывающий тег целиком: от `<Tag` до `>` своего уровня. */
function openingTag(source: string, from: number): string {
  let depth = 0;
  for (let i = from; i < source.length; i += 1) {
    const char = source[i];
    if (char === '{' || char === '(' || char === '[') depth += 1;
    else if (char === '}' || char === ')' || char === ']') depth -= 1;
    else if (char === '>' && depth === 0) return source.slice(from, i + 1);
  }
  return source.slice(from);
}

/**
 * Все нажимаемые элементы файла с их зонами нажатия.
 *
 * Берётся только проп `style` САМОГО элемента: размеры значка внутри кнопки
 * (счётчик непрочитанного, галочка) к зоне нажатия отношения не имеют, и
 * считать их нарушением значило бы завалить тест ложными срабатываниями.
 */
export function scanPressables(source: string): PressableSize[] {
  const styles = extractStyles(source);
  const found: PressableSize[] = [];
  const tagPattern = new RegExp(`<(${PRESSABLE_TAGS.join('|')})(?=[\\s/>])`, 'g');
  let match: RegExpExecArray | null;
  while ((match = tagPattern.exec(source)) !== null) {
    const tag = openingTag(source, match.index);
    const styleProp = tag.match(/\bstyle\s*=\s*\{[\s\S]*$/);
    const names = [...(styleProp?.[0] ?? '').matchAll(/styles\.([A-Za-z0-9_]+)/g)].map((m) => m[1]);
    const slop = hitSlopOf(tag);

    let kind: SizeKind = 'none';
    let smallest: number | null = null;
    const consider = (value: number | null, extra: number): void => {
      if (value === null) return;
      const effective = value + extra;
      smallest = smallest === null ? effective : Math.min(smallest, effective);
    };
    for (const name of names) {
      const body = styles.get(name);
      if (body === undefined) continue;
      const size = styleSize(body);
      if (size.kind === 'token') kind = 'token';
      else if (size.kind === 'number' && kind !== 'token') kind = 'number';
      consider(size.height, slop.vertical);
      consider(size.width, slop.horizontal);
    }

    found.push({ tag: match[1], line: source.slice(0, match.index).split('\n').length, styles: names, kind, smallest });
  }
  return found;
}

/**
 * Занижения: элемент, у которого объявленная зона нажатия меньше порога.
 *
 * Токен рядом не спасает: `minWidth: hitTarget` при `minHeight: 28` — то же
 * занижение, и в расчёт идёт наименьшая сторона.
 */
export function hitTargetViolations(items: readonly PressableSize[]): HitTargetViolation[] {
  return items.filter(
    (item): item is HitTargetViolation => item.smallest !== null && item.smallest < MIN_HIT_TARGET,
  );
}
