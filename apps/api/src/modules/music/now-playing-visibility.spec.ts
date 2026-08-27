import {
  isNowPlayingStale,
  isNowPlayingVisible,
} from './now-playing-visibility';
import type { NowPlayingVisibilityInput } from './now-playing-visibility';

const input = (
  over: Partial<NowPlayingVisibilityInput> = {},
): NowPlayingVisibilityInput => ({
  visibility: 'friends',
  isPrivateSession: false,
  viewerIsFriend: true,
  viewerBlocked: false,
  stale: false,
  ...over,
});

describe('isNowPlayingVisible', () => {
  it('друг видит', () => {
    expect(isNowPlayingVisible(input())).toBe(true);
  });

  it('чужой не видит даже при настройке «друзьям»', () => {
    expect(isNowPlayingVisible(input({ viewerIsFriend: false }))).toBe(false);
  });

  it('настройка «никому» перекрывает дружбу', () => {
    expect(isNowPlayingVisible(input({ visibility: 'nobody' }))).toBe(false);
  });

  it('невидимый сеанс перекрывает всё', () => {
    expect(isNowPlayingVisible(input({ isPrivateSession: true }))).toBe(false);
  });

  it('заблокировавший не видит, что я слушаю', () => {
    expect(isNowPlayingVisible(input({ viewerBlocked: true }))).toBe(false);
  });

  it('протухшая строка невидима, даже когда всё разрешено', () => {
    expect(isNowPlayingVisible(input({ stale: true }))).toBe(false);
  });

  it('каждый запрет действует в одиночку', () => {
    // Ни один из них не должен зависеть от остальных: иначе снятие одного
    // условия молча откроет прослушивание там, где его закрыли другим.
    const запреты: Partial<NowPlayingVisibilityInput>[] = [
      { isPrivateSession: true },
      { visibility: 'nobody' },
      { viewerBlocked: true },
      { stale: true },
      { viewerIsFriend: false },
    ];

    for (const запрет of запреты) {
      expect(isNowPlayingVisible(input(запрет))).toBe(false);
    }
  });
});

describe('isNowPlayingStale', () => {
  const now = new Date('2026-08-27T12:00:00.000Z');

  it('свежий heartbeat — не протухло', () => {
    expect(
      isNowPlayingStale(
        {
          updatedAt: new Date('2026-08-27T11:59:30.000Z'),
          durationSeconds: 200,
        },
        now,
      ),
    ).toBe(false);
  });

  it('дольше длительности плюс две минуты — протухло', () => {
    expect(
      isNowPlayingStale(
        {
          updatedAt: new Date('2026-08-27T11:50:00.000Z'),
          durationSeconds: 200,
        },
        now,
      ),
    ).toBe(true);
  });

  it('длинная лекция не протухает раньше времени', () => {
    // Час записи: heartbeat мог не прийти, потому что человек её слушает.
    expect(
      isNowPlayingStale(
        {
          updatedAt: new Date('2026-08-27T11:40:00.000Z'),
          durationSeconds: 3600,
        },
        now,
      ),
    ).toBe(false);
  });

  it('ровно на границе ещё не протухло', () => {
    // 200 секунд записи плюс две минуты запаса = 320 секунд.
    expect(
      isNowPlayingStale(
        {
          updatedAt: new Date('2026-08-27T11:54:40.000Z'),
          durationSeconds: 200,
        },
        now,
      ),
    ).toBe(false);
  });

  it('на секунду позже границы — протухло', () => {
    expect(
      isNowPlayingStale(
        {
          updatedAt: new Date('2026-08-27T11:54:39.000Z'),
          durationSeconds: 200,
        },
        now,
      ),
    ).toBe(true);
  });

  it('нулевая длительность не делает строку вечной', () => {
    expect(
      isNowPlayingStale(
        {
          updatedAt: new Date('2026-08-27T11:50:00.000Z'),
          durationSeconds: 0,
        },
        now,
      ),
    ).toBe(true);
  });
});
