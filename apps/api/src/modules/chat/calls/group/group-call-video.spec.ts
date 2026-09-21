import {
  GROUP_CALL_MAX_VIDEO,
  VIDEO_DENIAL_TEXT,
  videoCount,
  videoDecision,
  videoSlotsLeft,
  videoToTurnOff,
} from './group-call-video';
import {
  GROUP_CALL_MAX_PARTICIPANTS,
  GROUP_CALL_PARTICIPANT_TTL_MS,
  type RoomParticipant,
} from './group-call-room';

/**
 * Потолок камер — самое дорогое правило комнаты: ошибка в нём даёт либо
 * четвёртую камеру (телефон уходит в троттлинг и рушит разговор всем
 * сразу), либо место, застрявшее за человеком, которого в комнате нет.
 * Поэтому здесь таблица случаев, а не проверка «в целом работает».
 */

const NOW = 1_700_000_000_000;

function p(
  userId: string,
  joinedAtOffset: number,
  video = false,
  lastSeenOffset = 0,
): RoomParticipant {
  return {
    userId,
    joinedAt: NOW + joinedAtOffset,
    lastSeenAt: NOW + lastSeenOffset,
    muted: false,
    video,
  };
}

describe('потолок камер', () => {
  it('в комнате мест под видео меньше, чем мест вообще', () => {
    // Смысл всей задачи одной строкой: четвёртый участник существует, а
    // четвёртой камеры нет.
    expect(GROUP_CALL_MAX_VIDEO).toBeLessThan(GROUP_CALL_MAX_PARTICIPANTS);
  });

  it('трое включают камеры', () => {
    const room = [p('a', 0, true), p('b', 1, true), p('c', 2)];
    expect(videoDecision(room, 'c', true, NOW)).toEqual({
      kind: 'set',
      video: true,
    });
  });

  it('четвёртый получает отказ, а не молчание', () => {
    const room = [p('a', 0, true), p('b', 1, true), p('c', 2, true), p('d', 3)];
    const decision = videoDecision(room, 'd', true, NOW);
    expect(decision).toEqual({ kind: 'deny', reason: 'video-full' });
  });

  it('текст отказа говорит, сколько может участвовать', () => {
    expect(VIDEO_DENIAL_TEXT['video-full']).toContain(
      'В групповом видео могут участвовать трое',
    );
  });

  it('четвёртый остаётся в звонке голосом: выключить камеру ему не мешают', () => {
    const room = [p('a', 0, true), p('b', 1, true), p('c', 2, true), p('d', 3)];
    // Камера у него и так выключена — это не отказ, а «ничего не делаем».
    expect(videoDecision(room, 'd', false, NOW)).toEqual({ kind: 'noop' });
  });

  it('место освобождается, как только кто-то выключил камеру', () => {
    const room = [
      p('a', 0, true),
      p('b', 1, true),
      p('c', 2, false),
      p('d', 3),
    ];
    expect(videoDecision(room, 'd', true, NOW)).toEqual({
      kind: 'set',
      video: true,
    });
  });

  it('уехавший в тоннель места под видео не держит', () => {
    const dead = p('c', 2, true, -(GROUP_CALL_PARTICIPANT_TTL_MS + 1));
    const room = [p('a', 0, true), p('b', 1, true), dead, p('d', 3)];
    expect(videoCount(room, NOW)).toBe(2);
    expect(videoDecision(room, 'd', true, NOW)).toEqual({
      kind: 'set',
      video: true,
    });
  });

  it('повтор «включить» у того, у кого уже включено, места не занимает', () => {
    // Иначе человек терял бы своё же видео при каждом переподключении.
    const room = [p('a', 0, true), p('b', 1, true), p('c', 2, true)];
    expect(videoDecision(room, 'c', true, NOW)).toEqual({ kind: 'noop' });
  });

  it('выключение разрешено даже когда мест нет', () => {
    const room = [p('a', 0, true), p('b', 1, true), p('c', 2, true)];
    expect(videoDecision(room, 'c', false, NOW)).toEqual({
      kind: 'set',
      video: false,
    });
  });

  it('в закрытой комнате камеру не включить и не выключить', () => {
    const room = [p('a', 0, true)];
    expect(videoDecision(room, 'a', false, NOW, 'ended')).toEqual({
      kind: 'deny',
      reason: 'ended',
    });
  });

  it('чужому в комнате отказывают отдельной причиной', () => {
    const room = [p('a', 0), p('b', 1)];
    expect(videoDecision(room, 'z', true, NOW)).toEqual({
      kind: 'deny',
      reason: 'not-in-room',
    });
  });

  it('протухший участник камерой не управляет', () => {
    const dead = p('a', 0, false, -(GROUP_CALL_PARTICIPANT_TTL_MS + 1));
    expect(videoDecision([dead], 'a', true, NOW)).toEqual({
      kind: 'deny',
      reason: 'not-in-room',
    });
  });
});

describe('сколько мест осталось', () => {
  it('пустая комната отдаёт все места', () => {
    expect(videoSlotsLeft([p('a', 0)], NOW)).toBe(GROUP_CALL_MAX_VIDEO);
  });

  it('с каждой камерой мест на одно меньше', () => {
    expect(videoSlotsLeft([p('a', 0, true), p('b', 1)], NOW)).toBe(
      GROUP_CALL_MAX_VIDEO - 1,
    );
  });

  it('ниже нуля не опускается даже при рассогласовании строк', () => {
    const room = [
      p('a', 0, true),
      p('b', 1, true),
      p('c', 2, true),
      p('d', 3, true),
    ];
    expect(videoSlotsLeft(room, NOW)).toBe(0);
  });
});

describe('гашение лишних камер', () => {
  it('штатно гасить некого', () => {
    const room = [p('a', 0, true), p('b', 1, true), p('c', 2), p('d', 3)];
    expect(videoToTurnOff(room, NOW)).toEqual([]);
  });

  it('лишние гасятся по позже вошедшим, а не «случайные»', () => {
    const room = [
      p('a', 0, true),
      p('b', 1, true),
      p('c', 2, true),
      p('d', 3, true),
    ];
    expect(videoToTurnOff(room, NOW)).toEqual(['d']);
  });

  it('мёртвые в счёт лишних не идут', () => {
    const dead = p('a', 0, true, -(GROUP_CALL_PARTICIPANT_TTL_MS + 1));
    const room = [dead, p('b', 1, true), p('c', 2, true), p('d', 3, true)];
    expect(videoToTurnOff(room, NOW)).toEqual([]);
  });
});
