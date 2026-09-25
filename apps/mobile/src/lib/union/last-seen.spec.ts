import { lastSeenLabel } from './last-seen';

// Среда, 24 сентября 2026, 15:00 по местному времени телефона.
const NOW = new Date(2026, 8, 24, 15, 0, 0);
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();

describe('lastSeenLabel', () => {
  it('давно не заходивших не клеймим — подписи нет', () => {
    expect(lastSeenLabel('long_ago', null, NOW)).toBeNull();
    expect(lastSeenLabel(null, null, NOW)).toBeNull();
  });

  it('в сети — без времени', () => {
    expect(lastSeenLabel('online', ago(5_000), NOW)).toBe('В сети');
  });

  it('без точного времени — огрублённый уровень', () => {
    expect(lastSeenLabel('today', null, NOW)).toBe('Был(а) сегодня');
    expect(lastSeenLabel('week', 'не дата', NOW)).toBe('Был(а) на этой неделе');
  });

  it('свежий визит — минутами, с правильным склонением', () => {
    expect(lastSeenLabel('today', ago(60_000), NOW)).toBe('Был(а) 1 минуту назад');
    expect(lastSeenLabel('today', ago(3 * 60_000), NOW)).toBe('Был(а) 3 минуты назад');
    expect(lastSeenLabel('today', ago(12 * 60_000), NOW)).toBe('Был(а) 12 минут назад');
    expect(lastSeenLabel('today', ago(10_000), NOW)).toBe('Был(а) 1 минуту назад');
  });

  it('сегодня — часами', () => {
    expect(lastSeenLabel('today', ago(2 * 3_600_000), NOW)).toBe('Был(а) 2 часа назад');
    expect(lastSeenLabel('today', ago(5 * 3_600_000), NOW)).toBe('Был(а) 5 часов назад');
  });

  it('вчера и раньше — часами на циферблате', () => {
    expect(lastSeenLabel('week', new Date(2026, 8, 23, 21, 40).toISOString(), NOW)).toBe('Был(а) вчера в 21:40');
    expect(lastSeenLabel('week', new Date(2026, 8, 20, 9, 5).toISOString(), NOW)).toBe('Был(а) в воскресенье в 09:05');
  });

  it('визит «из будущего» — это расхождение часов, а не поломка', () => {
    expect(lastSeenLabel('today', ago(-60_000), NOW)).toBe('В сети');
  });
});
