import type { WellnessHistoryItem } from '@vedamatch/shared';
import { describeHistoryItem, describeScanTime, HISTORY_EMPTY } from './history-copy';

const NOW = new Date(2026, 8, 23, 18, 30);

function item(overrides: Partial<WellnessHistoryItem> = {}): WellnessHistoryItem {
  return {
    id: 's1',
    kind: 'barcode',
    barcode: '4600680000596',
    productId: 'p1',
    productName: 'Мармелад «Ягодка»',
    verdict: 'forbidden',
    createdAt: new Date(2026, 8, 23, 14, 5).toISOString(),
    ...overrides,
  };
}

describe('describeScanTime', () => {
  it('сегодняшнее — временем', () => {
    expect(describeScanTime(new Date(2026, 8, 23, 14, 5).toISOString(), NOW)).toBe(
      'сегодня в 14:05',
    );
  });

  it('вчерашнее так и называется', () => {
    expect(describeScanTime(new Date(2026, 8, 22, 9, 0).toISOString(), NOW)).toBe(
      'вчера в 09:00',
    );
  });

  it('этот год — день и месяц без года', () => {
    expect(describeScanTime(new Date(2026, 8, 12, 9, 0).toISOString(), NOW)).toBe(
      '12 сентября',
    );
  });

  it('прошлый год — с годом, иначе «12 сентября» врёт', () => {
    expect(describeScanTime(new Date(2025, 8, 12, 9, 0).toISOString(), NOW)).toBe(
      '12 сентября 2025',
    );
  });

  it('первое число месяца не превращается в «вчера» из-за перехода', () => {
    const first = new Date(2026, 8, 1, 10, 0);
    const second = new Date(2026, 8, 2, 10, 0);
    expect(describeScanTime(first.toISOString(), second)).toBe('вчера в 10:00');
    expect(describeScanTime(new Date(2026, 7, 31, 10, 0).toISOString(), first)).toBe(
      'вчера в 10:00',
    );
  });

  it('мусор вместо даты не роняет экран', () => {
    expect(describeScanTime('не дата', NOW)).toBe('');
  });

  it('минуты дополняются нулём', () => {
    expect(describeScanTime(new Date(2026, 8, 23, 7, 5).toISOString(), NOW)).toContain(
      '07:05',
    );
  });
});

describe('describeHistoryItem', () => {
  it('сначала название товара', () => {
    expect(describeHistoryItem(item(), NOW).title).toBe('Мармелад «Ягодка»');
  });

  it('без названия — штрихкод, а не пустая строка', () => {
    expect(describeHistoryItem(item({ productName: null }), NOW).title).toBe(
      'Штрихкод 4600680000596',
    );
  });

  it('снимок состава без кода тоже назван', () => {
    expect(
      describeHistoryItem(item({ productName: null, barcode: null, kind: 'photo' }), NOW)
        .title,
    ).toBe('Снимок состава');
  });

  it('видно, чем проверяли: камерой или руками', () => {
    expect(describeHistoryItem(item(), NOW).subtitle).toContain('камеры');
    expect(describeHistoryItem(item({ kind: 'manual' }), NOW).subtitle).toContain(
      'вручную',
    );
  });

  it('ответ назван словом и покрашен тоном', () => {
    const line = describeHistoryItem(item(), NOW);
    expect(line.verdict).toBe('Не подходит');
    expect(line.tone).toBe('danger');
    expect(describeHistoryItem(item({ verdict: 'clean' }), NOW).tone).toBe('success');
    expect(describeHistoryItem(item({ verdict: 'unknown' }), NOW).tone).toBe('neutral');
  });

  it('скринридеру строка читается целиком', () => {
    const line = describeHistoryItem(item(), NOW);
    expect(line.accessibilityLabel).toContain(line.title);
    expect(line.accessibilityLabel).toContain(line.verdict);
    expect(line.accessibilityLabel).toContain('сегодня в 14:05');
  });

  it('пустая история объясняет, откуда возьмутся записи', () => {
    expect(HISTORY_EMPTY.body).toContain('штрихкод');
  });
});
