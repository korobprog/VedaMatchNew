import { groupCallEndedText, groupCallStartedText } from './group-call-message';

describe('карточка группового звонка в ленте', () => {
  it('идущий звонок — без длительности: по пустому durationSec клиент понимает «идёт»', () => {
    expect(groupCallStartedText()).toEqual({
      body: 'Групповой звонок начался',
      title: 'Групповой звонок',
      subtitle: 'Идёт',
      durationSec: null,
    });
  });

  it('завершённый — длительность от открытия до закрытия комнаты', () => {
    const text = groupCallEndedText(
      new Date('2026-09-26T10:00:00Z'),
      new Date('2026-09-26T10:12:05Z'),
    );
    expect(text).toEqual({
      body: 'Групповой звонок завершён · 12:05',
      title: 'Групповой звонок',
      subtitle: '12:05',
      durationSec: 725,
    });
  });

  it('больше часа — с часами', () => {
    expect(
      groupCallEndedText(
        new Date('2026-09-26T10:00:00Z'),
        new Date('2026-09-26T11:02:05Z'),
      ).subtitle,
    ).toBe('1:02:05');
  });

  it('без времени закрытия или с перепутанными часами — ноль, а не минус', () => {
    const at = new Date('2026-09-26T10:00:00Z');
    expect(groupCallEndedText(at, null).durationSec).toBe(0);
    expect(
      groupCallEndedText(at, new Date('2026-09-26T09:59:00Z')).durationSec,
    ).toBe(0);
  });
});
