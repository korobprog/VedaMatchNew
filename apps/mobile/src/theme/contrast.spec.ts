import { composite, contrastRatio } from './contrast';
import { dark, light, type Palette } from './tokens';

describe('contrastRatio', () => {
  it('чёрный на белом — 21:1, одинаковые цвета — 1:1', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
    expect(contrastRatio('#777777', '#777777')).toBeCloseTo(1, 5);
  });

  it('полупрозрачную подложку накладывает на основу', () => {
    expect(composite('rgba(255, 255, 255, 0.5)', '#000000')).toEqual([128, 128, 128]);
    expect(contrastRatio('#FFFFFF', 'rgba(0, 0, 0, 0)', '#FFFFFF')).toBeCloseTo(1, 5);
  });
});

/**
 * Пары, которые реально стоят в интерфейсе. Мелкий текст — не ниже 4.5:1.
 * Новая пара в экране — новая строка здесь.
 */
const PAIRS: { name: string; text: keyof Palette; surface: keyof Palette }[] = [
  { name: 'вторичный текст на фоне экрана', text: 'text2', surface: 'bg0' },
  { name: 'подписи на фоне экрана', text: 'text1', surface: 'bg0' },
  { name: 'текст своего сообщения', text: 'text0', surface: 'bg2' },
  { name: 'время в своём сообщении', text: 'text1', surface: 'bg2' },
  { name: 'время и подписи на стекле', text: 'text1', surface: 'glass' },
  { name: 'имя автора в группе на стекле', text: 'violet', surface: 'glass' },
  { name: 'разделитель дня', text: 'text1', surface: 'bg1' },
  { name: 'счётчик непрочитанного', text: 'onMint', surface: 'mint' },
  { name: 'приглушённый счётчик', text: 'text1', surface: 'bg2' },
  { name: 'текст на заливке magenta', text: 'onAccent', surface: 'magenta' },
  { name: '«печатает…» в шапке переписки', text: 'cyan', surface: 'bg0' },
  { name: 'текст ошибки отправки', text: 'magenta', surface: 'bg0' },
  { name: 'заголовок карточки на стекле', text: 'text0', surface: 'glass' },
  { name: 'текст плашки ошибки', text: 'text0', surface: 'bg1' },
  // Листы (`message-menu.tsx`, `attachment-sheet.tsx`) непрозрачные — `bg1`,
  // не полупрозрачный `sheet` (раунд оценки 002: сквозь `sheet` было видно
  // ленту сообщений). `magenta` на `bg1` в светлой теме даёт только ≈4.24:1,
  // поэтому «Удалить» тоже текстом `text0`, тот же пункт меню ниже.
  { name: 'пункт листа (меню сообщения / вложения)', text: 'text0', surface: 'bg1' },
  // Активный сегмент «Справочник»/«Запросы» (`(tabs)/people.tsx`): заливка
  // сменилась с `bg2` на `bg0` — прежняя пара `bg2` на контейнере `bg1`
  // почти не отличалась глазом (раунд оценки 004, дефект 8).
  { name: 'активный сегмент «Люди»', text: 'text0', surface: 'bg0' },
  // Секция «Проверить обновление» (VED-176): мета карточки и подсказки —
  // `text1` на непрозрачной карточке `bg1`, заголовок — `text0` на `bg1`.
  { name: 'мета карточки обновления', text: 'text1', surface: 'bg1' },
  { name: 'заголовок карточки обновления', text: 'text0', surface: 'bg1' },
  // Голосовые сообщения (VED-286): таймер записи и текст ошибки/отказа
  // микрофона в `voice-recorder-control.tsx` — на непрозрачном `glass`,
  // не на цвете пузыря сообщения (там magenta на `bg2` даёт в светлой теме
  // только 3.85:1 — поэтому ошибка ПЛЕЕРА красится в `text0`, см.
  // `voice-message-player.tsx`, а не magenta).
  { name: 'таймер и ошибка записи голосового на стекле', text: 'magenta', surface: 'glass' },
];

describe.each([
  ['светлая тема', light],
  ['тёмная тема', dark],
])('контраст: %s', (_, palette) => {
  it.each(PAIRS)('$name — не ниже 4.5:1', ({ text, surface }) => {
    expect(contrastRatio(palette[text], palette[surface], palette.bg0)).toBeGreaterThanOrEqual(4.5);
  });
});

/**
 * Значки подтверждения (`components/verified-badge.tsx`, вариант `dot`):
 * иконка — не текст, порог WCAG 1.4.11 мягче — 3:1, не 4.5:1.
 */
const NON_TEXT_PAIRS: { name: string; graphic: keyof Palette; surface: keyof Palette }[] = [
  { name: 'иконка значка «Преданный» на кружке cyan', graphic: 'bg0', surface: 'cyan' },
  { name: 'иконка значка «Фото проверено» на кружке gold', graphic: 'bg0', surface: 'gold' },
  // Полоса прогресса секции самообновления (`self-update-section.tsx`, VED-176):
  // заполнение на дорожке `bg2` — magenta при скачивании, cyan при проверке файла.
  { name: 'заполнение прогресса скачивания на дорожке', graphic: 'magenta', surface: 'bg2' },
  { name: 'заполнение прогресса проверки файла на дорожке', graphic: 'cyan', surface: 'bg2' },
];

describe.each([
  ['светлая тема', light],
  ['тёмная тема', dark],
])('контраст нетекстовой графики: %s', (_, palette) => {
  it.each(NON_TEXT_PAIRS)('$name — не ниже 3:1', ({ graphic, surface }) => {
    expect(contrastRatio(palette[graphic], palette[surface], palette.bg0)).toBeGreaterThanOrEqual(3);
  });
});
