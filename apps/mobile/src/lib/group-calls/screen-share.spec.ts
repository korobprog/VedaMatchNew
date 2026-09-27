import type { ChatGroupCallDto, ChatGroupCallParticipantDto } from '@vedamatch/shared';
import {
  cameraToggleNeedsServer,
  canShareScreen,
  describeScreenShareError,
  MIN_SCREEN_SHARE_ANDROID_API,
  SCREEN_CAPTURE_SCALE,
  screenButtonState,
  screenFlagStale,
  screenStopPatch,
} from './screen-share';
import { outgoingVideo } from './group-video-state';
import {
  degradationFor,
  groupScreenEncoding,
  groupVideoEncoding,
} from './group-video-quality';

/**
 * Копия спеки сайта (`apps/web/.../group/screen-share.spec.ts`) там, где
 * правила общие, плюс то, что есть только у телефона: Android-версия,
 * фон вместо скрытой вкладки, ошибки react-native-webrtc.
 */

function participant(
  id: string,
  opts: { video?: boolean; screen?: boolean } = {},
): ChatGroupCallParticipantDto {
  return {
    user: { id, name: `Имя ${id}`, avatarUrl: null, lastSeenAt: null },
    joinedAt: new Date().toISOString(),
    muted: false,
    video: opts.video ?? false,
    screen: opts.screen ?? false,
    host: false,
  };
}

function call(
  participants: ChatGroupCallParticipantDto[],
  overrides: Partial<ChatGroupCallDto> = {},
): ChatGroupCallDto {
  return {
    id: 'room-1',
    conversationId: 'conv-1',
    kind: 'audio',
    status: 'live',
    hostId: participants[0]?.user.id ?? null,
    startedBy: { id: 'a', name: 'a', avatarUrl: null, lastSeenAt: null },
    createdAt: new Date().toISOString(),
    endedAt: null,
    participants,
    maxParticipants: 4,
    maxVideoParticipants: 3,
    ...overrides,
  };
}

describe('есть ли кнопка «Показать экран»', () => {
  it('Android 10 и новее — есть', () => {
    expect(MIN_SCREEN_SHARE_ANDROID_API).toBe(29);
    expect(canShareScreen({ os: 'android', version: 29 })).toBe(true);
    expect(canShareScreen({ os: 'android', version: 35 })).toBe(true);
  });

  it('Android 9 и старше — нет', () => {
    expect(canShareScreen({ os: 'android', version: 28 })).toBe(false);
  });

  it('веб-сборка и iOS — нет', () => {
    expect(canShareScreen({ os: 'web', version: 0 })).toBe(false);
    expect(canShareScreen({ os: 'ios', version: '18.0' })).toBe(false);
  });

  it('версия строкой тоже понимается', () => {
    expect(canShareScreen({ os: 'android', version: '34' })).toBe(true);
    expect(canShareScreen({ os: 'android', version: 'x' })).toBe(false);
  });
});

describe('кнопка «Показать экран»', () => {
  const supported = { sharing: false, supported: true };

  it('телефон не умеет — кнопки нет', () => {
    expect(
      screenButtonState(call([participant('a')]), 'a', { sharing: false, supported: false })
        .visible,
    ).toBe(false);
  });

  it('свободно — можно', () => {
    expect(screenButtonState(call([participant('a')]), 'a', supported)).toEqual({
      visible: true,
      willStart: true,
      blocked: false,
      blockedReason: null,
    });
  });

  it('показывает другой — погашена и называет кого', () => {
    const state = screenButtonState(
      call([participant('a'), participant('b', { video: true, screen: true })]),
      'a',
      supported,
    );
    expect(state.blocked).toBe(true);
    expect(state.blockedReason).toBe('Экран показывает Имя b');
  });

  it('мест под видео нет, своей камеры нет — погашена', () => {
    const state = screenButtonState(
      call([
        participant('a', { video: true }),
        participant('b', { video: true }),
        participant('c', { video: true }),
        participant('d'),
      ]),
      'd',
      supported,
    );
    expect(state.blocked).toBe(true);
    expect(state.blockedReason).toMatch(/места под видео заняты/);
  });

  it('мест нет, но своя камера включена — можно', () => {
    const state = screenButtonState(
      call([
        participant('a', { video: true }),
        participant('b', { video: true }),
        participant('c', { video: true }),
      ]),
      'c',
      supported,
    );
    expect(state.blocked).toBe(false);
  });

  it('свой показ остановить можно всегда', () => {
    expect(
      screenButtonState(call([participant('a', { video: true, screen: true })]), 'a', {
        sharing: true,
        supported: true,
      }),
    ).toMatchObject({ willStart: false, blocked: false });
  });
});

describe('конец показа', () => {
  it('камера была включена — возвращается', () => {
    expect(screenStopPatch(true)).toEqual({ screen: false, video: true });
  });

  it('камеры не было — видео гаснет, место отдаётся', () => {
    expect(screenStopPatch(false)).toEqual({ screen: false, video: false });
  });

  it('«камера» во время показа сервер не трогает', () => {
    expect(cameraToggleNeedsServer(true)).toBe(false);
    expect(cameraToggleNeedsServer(false)).toBe(true);
  });

  it('потерянный конец показа чинится, но не во время начала', () => {
    const room = call([participant('me', { video: true, screen: true })]);
    expect(screenFlagStale(room, 'me', { sharing: false, pending: false })).toBe(true);
    expect(screenFlagStale(room, 'me', { sharing: false, pending: true })).toBe(false);
    expect(screenFlagStale(room, 'me', { sharing: true, pending: false })).toBe(false);
  });
});

describe('что уходит в видео-отправитель', () => {
  const base = {
    phase: 'active',
    cameraOn: false,
    screenOn: false,
    appState: 'active',
    pipActive: false,
  } as const;

  it('экран сильнее камеры', () => {
    expect(outgoingVideo({ ...base, cameraOn: true, screenOn: true })).toBe('screen');
  });

  it('фон гасит камеру, но не экран — показывают как раз другое приложение', () => {
    expect(outgoingVideo({ ...base, cameraOn: true, appState: 'background' })).toBeNull();
    expect(outgoingVideo({ ...base, screenOn: true, appState: 'background' })).toBe('screen');
  });

  it('показ кончился — камера возвращается, если была включена', () => {
    expect(outgoingVideo({ ...base, cameraOn: true })).toBe('camera');
    expect(outgoingVideo(base)).toBeNull();
  });

  it('вне разговора не уходит ничего', () => {
    expect(outgoingVideo({ ...base, phase: 'joining', screenOn: true })).toBeNull();
  });
});

describe('качество показа', () => {
  it('кадр не уменьшается кодером ни на каком составе', () => {
    for (let n = 0; n < 6; n += 1)
      expect(groupScreenEncoding('wifi', n).scaleResolutionDownBy).toBe(1);
  });

  it('частота падает с ростом комнаты, битрейт — как у камеры', () => {
    expect(groupScreenEncoding('wifi', 4).maxFramerate).toBeLessThan(
      groupScreenEncoding('wifi', 2).maxFramerate,
    );
    for (let n = 2; n < 5; n += 1)
      expect(groupScreenEncoding('cellular', n).maxBitrate).toBe(
        groupVideoEncoding('cellular', n).maxBitrate,
      );
  });

  it('экран жертвует частотой, камера — чем угодно', () => {
    expect(degradationFor('screen')).toBe('maintain-resolution');
    expect(degradationFor('camera')).toBe('balanced');
  });

  it('захват — меньше полного экрана, но не мельче половины', () => {
    expect(SCREEN_CAPTURE_SCALE).toBeLessThan(1);
    expect(SCREEN_CAPTURE_SCALE).toBeGreaterThanOrEqual(0.5);
  });
});

describe('почему показ не начался', () => {
  class ServerError extends Error {}
  const isServer = (e: unknown): e is Error => e instanceof ServerError;

  it('«Отмена» в системном окне — молчим (react-native-webrtc пишет её в message)', () => {
    expect(describeScreenShareError({ name: 'Error', message: 'NotAllowedError' }, isServer)).toBeNull();
    expect(describeScreenShareError({ name: 'NotAllowedError' }, isServer)).toBeNull();
  });

  it('служба показа не поднялась — просим повторить', () => {
    expect(describeScreenShareError({ message: 'AbortError' }, isServer)).toMatch(/ещё раз/);
  });

  it('отказ сервера — его текстом', () => {
    expect(describeScreenShareError(new ServerError('Экран уже показывает Имя b'), isServer)).toBe(
      'Экран уже показывает Имя b',
    );
  });

  it('неизвестное — общим текстом', () => {
    expect(describeScreenShareError(null, isServer)).toBe('Не удалось показать экран');
  });
});
