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
];

describe.each([
  ['светлая тема', light],
  ['тёмная тема', dark],
])('контраст: %s', (_, palette) => {
  it.each(PAIRS)('$name — не ниже 4.5:1', ({ text, surface }) => {
    expect(contrastRatio(palette[text], palette[surface], palette.bg0)).toBeGreaterThanOrEqual(4.5);
  });
});
