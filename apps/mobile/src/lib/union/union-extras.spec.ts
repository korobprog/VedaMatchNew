import type { UnionBoostStatus } from '@vedamatch/shared';
import { REPORT_REASONS, boostDescription, formatBoostLeft, reportComment, tickBoost } from './union-extras';

const active: UnionBoostStatus = { active: true, expiresAt: '2026-09-25T10:40:00Z', secondsLeft: 2, durationMinutes: 40 };

describe('жалоба', () => {
  it('причины — те же шесть, что на сайте', () => {
    expect(REPORT_REASONS.map((reason) => reason.value)).toEqual([
      'spam',
      'harassment',
      'fake_profile',
      'inappropriate_content',
      'offline_safety',
      'other',
    ]);
  });

  it('пустой комментарий уходит как null, длинный обрезается по пределу', () => {
    expect(reportComment('   ')).toBeNull();
    expect(reportComment(' спам в личке ')).toBe('спам в личке');
    expect(reportComment('я'.repeat(1200))).toHaveLength(1000);
  });
});

describe('«Внимание»', () => {
  it('остаток — мм:сс', () => {
    expect(formatBoostLeft(2400)).toBe('40:00');
    expect(formatBoostLeft(65)).toBe('1:05');
    expect(formatBoostLeft(-3)).toBe('0:00');
  });

  it('локальный отсчёт доходит до нуля и выключает «Внимание»', () => {
    const once = tickBoost(active);
    expect(once).toMatchObject({ active: true, secondsLeft: 1 });
    expect(tickBoost(once)).toEqual({ active: false, expiresAt: null, secondsLeft: 0, durationMinutes: 40 });
  });

  it('выключенное не тикает', () => {
    const idle = { ...active, active: false, secondsLeft: 0 };
    expect(tickBoost(idle)).toBe(idle);
  });

  it('текст окна — про время, без цены', () => {
    expect(boostDescription(null)).toMatch(/^40 минут/);
    expect(boostDescription({ ...active, secondsLeft: 125 })).toMatch(/ещё 2:05\.$/);
    expect(boostDescription(null)).not.toMatch(/₽|руб|оплат/i);
  });
});
