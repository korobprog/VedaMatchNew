import {
  DEFAULT_RETENTION_DAYS,
  retentionCutoff,
  retentionDays,
} from './chat-retention';

describe('retentionDays', () => {
  it('берёт значение из настройки', () => {
    expect(retentionDays('7')).toBe(7);
  });

  it('без настройки — срок по умолчанию', () => {
    expect(retentionDays(undefined)).toBe(DEFAULT_RETENTION_DAYS);
    expect(retentionDays('')).toBe(DEFAULT_RETENTION_DAYS);
  });

  it('мусор и дробное не включают нулевой срок', () => {
    // Иначе опечатка в настройке означала бы «стирать сразу».
    expect(retentionDays('неделя')).toBe(DEFAULT_RETENTION_DAYS);
    expect(retentionDays('0')).toBe(DEFAULT_RETENTION_DAYS);
    expect(retentionDays('-5')).toBe(DEFAULT_RETENTION_DAYS);
    expect(retentionDays('1.5')).toBe(DEFAULT_RETENTION_DAYS);
  });

  it('срок длиннее года теряет смысл и заменяется умолчанием', () => {
    expect(retentionDays('366')).toBe(DEFAULT_RETENTION_DAYS);
    expect(retentionDays('365')).toBe(365);
  });
});

describe('retentionCutoff', () => {
  it('отсчитывает границу назад от текущего момента', () => {
    const now = new Date('2026-08-30T12:00:00.000Z');
    expect(retentionCutoff(now, 30).toISOString()).toBe(
      '2026-07-31T12:00:00.000Z',
    );
  });
});
