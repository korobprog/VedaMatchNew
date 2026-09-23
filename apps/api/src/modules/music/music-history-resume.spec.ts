import { historyResumePosition } from './music-history-resume';

describe('historyResumePosition', () => {
  it('середину записи отдаёт целыми секундами', () => {
    expect(historyResumePosition(312.7, 600)).toBe(312);
  });

  it('начало и дослушанный хвост — не позиция', () => {
    expect(historyResumePosition(3, 600)).toBeNull();
    expect(historyResumePosition(590, 600)).toBeNull();
    expect(historyResumePosition(584, 600)).toBe(584);
  });

  it('без позиции — null', () => {
    expect(historyResumePosition(undefined, 600)).toBeNull();
    expect(historyResumePosition(null, 600)).toBeNull();
  });

  it('при неизвестной длительности хвост не считает', () => {
    expect(historyResumePosition(900, 0)).toBe(900);
  });
});
