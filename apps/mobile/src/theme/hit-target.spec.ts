import fs from 'node:fs';
import path from 'node:path';
import {
  MIN_HIT_TARGET,
  hitTargetViolations,
  scanPressables,
  type PressableSize,
} from './hit-target-scan';
import { hitTarget } from './tokens';

/**
 * Сторож зоны нажатия — уровня приложения, а не одного экрана.
 *
 * Правило пользователя «зона нажатия не меньше 44» до этого держалось на
 * глаз: токен в теме был, но занизить его или написать рядом голое число
 * можно было молча — ни один тест не падал (раунд оценки VED-333, итерация 1).
 * Устроено как `contrast.spec.ts`: там список реальных цветовых пар, здесь —
 * реальные нажимаемые элементы, вычитанные из исходников экранов.
 *
 * Разбор узкий и без догадок (`hit-target-scan.ts`), поэтому у теста две
 * половины. Первая ловит занижения. Вторая сторожит сам охват: сломанная
 * регулярка иначе означала бы «нарушений не найдено», то есть зелёный тест,
 * который ничего не проверяет.
 *
 * Чего он НЕ видит, и это осознанно: элементы, у которых высота набирается
 * отступами и содержимым (`paddingVertical` + шрифт), и размеры, приехавшие
 * пропсом (`size={72}`) или переменной. Такие помечаются «размер не объявлен»
 * и остаются на глаз — занизить их числом нельзя, потому что числа там нет.
 * `hitSlop` разбор читает: это штатный способ оставить значок маленьким, а
 * палец ловить по-крупному, и для правила он равноправен с размером.
 */

const SRC = path.join(__dirname, '..');

function sourceFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...sourceFiles(full));
    else if (entry.name.endsWith('.tsx') && !entry.name.includes('.spec.')) found.push(full);
  }
  return found;
}

const files = sourceFiles(SRC);
const scanned: { file: string; items: PressableSize[] }[] = files.map((file) => ({
  file: path.relative(SRC, file),
  items: scanPressables(fs.readFileSync(file, 'utf8')),
}));
const everything = scanned.flatMap(({ file, items }) => items.map((item) => ({ file, ...item })));

describe('зона нажатия', () => {
  it('токен темы не опускается ниже порога', () => {
    expect(hitTarget).toBeGreaterThanOrEqual(MIN_HIT_TARGET);
  });

  // Главная проверка: голое число меньше порога у нажимаемого элемента.
  // Сообщение называет файл, строку и стиль — чтобы не искать руками.
  it.each(scanned.filter(({ items }) => items.length > 0))('$file — ни одной зоны меньше 44', ({ file, items }) => {
    const bad = hitTargetViolations(items).map(
      (item) => `${file}:${item.line} <${item.tag} style={styles.${item.styles.join('/')}}> — ${item.smallest}`,
    );
    expect(bad).toEqual([]);
  });

  /**
   * Охват. Числа — нижние границы «столько уже разобрано», а не цель: они
   * падают, если разбор перестал узнавать раскладку экранов, и не мешают
   * добавлять новые. Поднимать их при росте приложения не требуется.
   */
  it('разбор узнаёт экраны и элементы, а не молчит', () => {
    expect(files.length).toBeGreaterThanOrEqual(85);
    expect(scanned.filter(({ items }) => items.length > 0).length).toBeGreaterThanOrEqual(45);
    expect(everything.length).toBeGreaterThanOrEqual(110);
  });

  it('у большинства нажимаемого размер приходит из токена темы', () => {
    expect(everything.filter((item) => item.kind === 'token').length).toBeGreaterThanOrEqual(80);
  });

  /**
   * Числом размер задают единицы, и каждое такое место названо поимённо:
   * список — цена права написать число вместо токена. Новая строка здесь
   * означает «я посмотрел и убедился, что это не кнопка размером с булавку».
   */
  it('числовые размеры у нажимаемого объявлены поимённо', () => {
    const numeric = everything
      .filter((item) => item.kind === 'number')
      .map((item) => `${item.file}:${item.styles.join('/')}=${item.smallest}`)
      .sort();
    expect(numeric).toEqual(
      [
        // Строка беседы: два ряда текста и аватар, 76 — больше порога.
        'components/chat/conversation-row.tsx:row=76',
        // Кнопки участника и выхода в групповом звонке — круги 64.
        // Микрофон и переворот камеры делят голый `circle`, камера добавляет
        // `blocked` (гаснет прозрачностью, но остаётся нажимаемой — иначе
        // четвёртый жмёт в мёртвую кнопку и не узнаёт причину), выход —
        // `leave`. Все четыре 64, порог перекрыт с запасом.
        'app/group-call/[id].tsx:circle=64',
        'app/group-call/[id].tsx:circle=64',
        'app/group-call/[id].tsx:circle/blocked=64',
        'app/group-call/[id].tsx:circle/leave=64',
        // Кнопка в полоске отказа микрофона: сама 36, до 44 добирается
        // `hitSlop` — полоска низкая, растить её значит двигать композер.
        'components/chat/voice/voice-recorder-control.tsx:deniedButton=44',
        'components/chat/voice/voice-recorder-control.tsx:deniedButton=44',
        // Главная кнопка полноэкранного плеера Медиатеки (VED-331) — круг 72:
        // «играть/пауза» — то, во что целятся не глядя.
        'app/music/player.tsx:primary/off=72',
        // Аватарки с кружком статусов (VED-129) — кнопки размером с саму
        // аватарку: 52 в строке беседы (плюс `hitSlop` 4 — отсюда 60) и 72
        // в карточке человека.
        'components/chat/conversation-row.tsx:avatarButton=60',
        'app/people/[id].tsx:avatarButton=72',
      ].sort(),
    );
  });
});
