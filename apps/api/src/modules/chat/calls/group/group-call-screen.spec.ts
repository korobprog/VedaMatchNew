import {
  screenDecision,
  screenDenialText,
  screenSharer,
} from './group-call-screen';
import {
  GROUP_CALL_PARTICIPANT_TTL_MS,
  type RoomParticipant,
} from './group-call-room';
import { GROUP_CALL_MAX_VIDEO } from './group-call-video';

/**
 * Показ экрана: одно место под видео, один экран на комнату. Таблица
 * случаев — по той же причине, что у потолка камер: ошибка даёт либо
 * четвёртое видео в обход потолка, либо два экрана разом.
 */

const NOW = 1_700_000_000_000;

function p(
  userId: string,
  joinedAtOffset: number,
  opts: { video?: boolean; screen?: boolean; lastSeenOffset?: number } = {},
): RoomParticipant {
  return {
    userId,
    joinedAt: NOW + joinedAtOffset,
    lastSeenAt: NOW + (opts.lastSeenOffset ?? 0),
    muted: false,
    video: opts.video ?? false,
    screen: opts.screen ?? false,
  };
}

describe('кто показывает экран', () => {
  it('никто — null', () => {
    expect(screenSharer([p('a', 0), p('b', 1)], NOW)).toBeNull();
  });

  it('живой показывающий', () => {
    const room = [p('a', 0), p('b', 1, { video: true, screen: true })];
    expect(screenSharer(room, NOW)).toBe('b');
  });

  it('мёртвый показ не держит', () => {
    const room = [
      p('a', 0),
      p('b', 1, {
        video: true,
        screen: true,
        lastSeenOffset: -GROUP_CALL_PARTICIPANT_TTL_MS - 1,
      }),
    ];
    expect(screenSharer(room, NOW)).toBeNull();
  });

  it('двое по испорченным строкам — раньше вошедший', () => {
    const room = [
      p('b', 5, { video: true, screen: true }),
      p('a', 0, { video: true, screen: true }),
    ];
    expect(screenSharer(room, NOW)).toBe('a');
  });
});

describe('можно ли показать экран', () => {
  it('без камеры, место есть — показ занимает место', () => {
    expect(screenDecision([p('a', 0), p('b', 1)], 'a', true, NOW)).toEqual({
      kind: 'set',
      screen: true,
    });
  });

  it('своя камера отдаёт место экрану даже в полной комнате', () => {
    const room = [
      p('a', 0, { video: true }),
      p('b', 1, { video: true }),
      p('c', 2, { video: true }),
      p('d', 3),
    ];
    expect(screenDecision(room, 'a', true, NOW)).toEqual({
      kind: 'set',
      screen: true,
    });
  });

  it('без камеры и без мест — отказ, как у камеры', () => {
    const room = [
      p('a', 0, { video: true }),
      p('b', 1, { video: true }),
      p('c', 2, { video: true }),
      p('d', 3),
    ];
    expect(GROUP_CALL_MAX_VIDEO).toBe(3);
    expect(screenDecision(room, 'd', true, NOW)).toEqual({
      kind: 'deny',
      reason: 'video-full',
    });
  });

  it('второй показ — отказ с тем, кто показывает', () => {
    const room = [p('a', 0, { video: true, screen: true }), p('b', 1)];
    expect(screenDecision(room, 'b', true, NOW)).toEqual({
      kind: 'deny',
      reason: 'screen-busy',
      holderId: 'a',
    });
  });

  it('чужой показ мёртвого не мешает', () => {
    const room = [
      p('a', 0, {
        video: true,
        screen: true,
        lastSeenOffset: -GROUP_CALL_PARTICIPANT_TTL_MS - 1,
      }),
      p('b', 1),
    ];
    expect(screenDecision(room, 'b', true, NOW)).toEqual({
      kind: 'set',
      screen: true,
    });
  });

  it('повтор «показываю» — не ошибка (переподключение)', () => {
    const room = [p('a', 0, { video: true, screen: true })];
    expect(screenDecision(room, 'a', true, NOW)).toEqual({ kind: 'noop' });
  });

  it('закончить показ можно всегда', () => {
    const room = [
      p('a', 0, { video: true, screen: true }),
      p('b', 1, { video: true }),
      p('c', 2, { video: true }),
    ];
    expect(screenDecision(room, 'a', false, NOW)).toEqual({
      kind: 'set',
      screen: false,
    });
  });

  it('закрытая комната и чужой — отказ', () => {
    expect(screenDecision([p('a', 0)], 'a', true, NOW, 'ended')).toEqual({
      kind: 'deny',
      reason: 'ended',
    });
    expect(screenDecision([p('a', 0)], 'z', true, NOW)).toEqual({
      kind: 'deny',
      reason: 'not-in-room',
    });
  });
});

describe('текст отказа', () => {
  it('называет показывающего', () => {
    expect(screenDenialText('screen-busy', 'Радха')).toMatch(
      /Экран уже показывает Радха/,
    );
  });

  it('без имени не пишет «undefined»', () => {
    expect(screenDenialText('screen-busy')).not.toMatch(/undefined|null/);
  });

  it('про места говорит числом', () => {
    expect(screenDenialText('video-full')).toMatch(
      String(GROUP_CALL_MAX_VIDEO),
    );
  });
});
