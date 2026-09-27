import type { ChatGroupCallDto, ChatGroupCallParticipantDto } from '@vedamatch/shared';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { screenText } from '@/components/blog/blog-test-helpers';
import { GroupCallsContext, type GroupCallsApi } from '@/lib/group-calls/group-call-context';
import { IDLE_GROUP_CALL_STATE } from '@/lib/group-calls/group-call-state';
import GroupCallScreen from './[id]';

/**
 * Экран звонка при чужом показе экрана (VED-360): сцена, полоса,
 * «во весь экран». WebRTC нет — контекст подставной, `RTCView` — заглушка
 * с теми же свойствами: проверяется раскладка и подписи, а не картинка.
 */

jest.mock('react-native-webrtc', () => ({
  __esModule: true,
  RTCView: (props: Record<string, unknown>) => jest.requireActual('react').createElement('RTCView', props),
}));
jest.mock('react-native-reanimated', () => ({ __esModule: true, useReducedMotion: () => true }));
jest.mock('expo-router', () => ({
  __esModule: true,
  useLocalSearchParams: () => ({ id: 'room-1' }),
  router: { back: jest.fn(), canGoBack: () => true, replace: jest.fn() },
}));
jest.mock('react-native-safe-area-context', () => ({
  __esModule: true,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('@/theme/theme', () => ({
  __esModule: true,
  useTheme: () => ({ colors: jest.requireActual('@/theme/tokens').light }),
}));
jest.mock('@/lib/feedback', () => ({ __esModule: true, confirmTap: () => undefined }));

function participant(
  id: string,
  opts: { video?: boolean; screen?: boolean } = {},
): ChatGroupCallParticipantDto {
  return {
    user: { id, name: `Имя ${id}`, avatarUrl: null, lastSeenAt: null },
    joinedAt: '2026-09-27T10:00:00.000Z',
    muted: false,
    video: opts.video ?? false,
    screen: opts.screen ?? false,
    host: id === 'me',
  };
}

function room(participants: ChatGroupCallParticipantDto[]): ChatGroupCallDto {
  return {
    id: 'room-1',
    conversationId: 'conv-1',
    kind: 'audio',
    status: 'live',
    hostId: 'me',
    startedBy: { id: 'me', name: 'Имя me' },
    createdAt: '2026-09-27T10:00:00.000Z',
    endedAt: null,
    maxParticipants: 4,
    maxVideoParticipants: 3,
    participants,
  };
}

const stream = (id: string) => ({ toURL: () => `stream-${id}` });

function api(call: ChatGroupCallDto, over: Partial<GroupCallsApi> = {}): GroupCallsApi {
  return {
    state: { ...IDLE_GROUP_CALL_STATE, phase: 'active', call, joinedAt: Date.now() },
    selfId: 'me',
    callInConversation: () => call,
    watchConversation: jest.fn(),
    startOrJoin: jest.fn(),
    join: jest.fn(),
    leave: jest.fn(),
    toggleMute: jest.fn(),
    cameraOn: false,
    sendingVideo: false,
    localVideoStream: null,
    toggleCamera: jest.fn(),
    switchCamera: jest.fn(),
    screenSupported: false,
    screenOn: false,
    toggleScreenShare: jest.fn(),
    localScreenStream: null,
    remoteStreams: {},
    remoteVideoOff: {},
    pipActive: false,
    clearActionError: jest.fn(),
    reportScreenMounted: jest.fn(),
    dismiss: jest.fn(),
    videoDiagnostics: jest.fn(),
    ...over,
  } as GroupCallsApi;
}

const mounted: ReactTestRenderer[] = [];

function render(value: GroupCallsApi): ReactTestRenderer {
  let renderer!: ReactTestRenderer;
  act(() => {
    renderer = create(
      <GroupCallsContext.Provider value={value}>
        <GroupCallScreen />
      </GroupCallsContext.Provider>,
    );
  });
  mounted.push(renderer);
  return renderer;
}

// Таймер длительности звонка тикает раз в секунду — экран убираем, чтобы
// он не тикал в уже закрытое окружение.
afterEach(() => {
  for (const renderer of mounted.splice(0)) act(() => renderer.unmount());
});

function views(renderer: ReactTestRenderer): ReactTestInstance[] {
  return renderer.root.findAll((node) => (node.type as unknown) === 'RTCView');
}

function buttonMatching(renderer: ReactTestRenderer, pattern: RegExp): ReactTestInstance {
  return renderer.root.find(
    (node) =>
      node.props.accessibilityRole === 'button' &&
      typeof node.props.onPress === 'function' &&
      pattern.test(String(node.props.accessibilityLabel ?? '')),
  );
}

function sharing(over: Partial<GroupCallsApi> = {}) {
  return api(
    room([participant('me'), participant('b', { video: true, screen: true }), participant('c', { video: true })]),
    { remoteStreams: { b: stream('b'), c: stream('c') } as unknown as GroupCallsApi['remoteStreams'], ...over },
  );
}

describe('чужой показ экрана', () => {
  it('экран на сцене — целиком и без зеркала, камера — как прежде', () => {
    const renderer = render(sharing());
    const byUrl = new Map(views(renderer).map((v) => [v.props.streamURL, v.props]));
    expect(byUrl.get('stream-b')).toMatchObject({ objectFit: 'contain', mirror: false });
    expect(byUrl.get('stream-c')).toMatchObject({ objectFit: 'cover' });
  });

  it('остальные — полосой, а не равной сеткой', () => {
    const renderer = render(sharing());
    const strip = renderer.root.find((node) => node.props.accessibilityLabel === 'Остальные в звонке');
    const tiles = strip.findAll((node) => typeof node.type === 'string' && node.props.accessible === true);
    expect(tiles).toHaveLength(2);
  });

  it('проговаривается, кто показывает', () => {
    const renderer = render(sharing());
    expect(screenText(renderer)).toContain('Имя b показывает экран');
    expect(buttonMatching(renderer, /Имя b.*показывает экран.*Развернуть во весь экран/)).toBeTruthy();
  });

  it('нажатие разворачивает во весь экран, «Свернуть» — обратно', () => {
    const renderer = render(sharing());
    const modal = () => renderer.root.find((node) => node.props.onRequestClose !== undefined && 'visible' in node.props);
    expect(modal().props.visible).toBe(false);

    act(() => buttonMatching(renderer, /Развернуть во весь экран/).props.onPress());
    expect(modal().props.visible).toBe(true);
    expect(modal().props.supportedOrientations).toEqual(['portrait', 'landscape']);

    act(() => buttonMatching(renderer, /^Свернуть экран$/).props.onPress());
    expect(modal().props.visible).toBe(false);
  });

  it('пока поток не доехал — разворачивать нечего', () => {
    const renderer = render(sharing({ remoteStreams: {} }));
    expect(screenText(renderer)).toContain('Готовим показ экрана…');
    expect(buttonMatching(renderer, /Развернуть во весь экран/).props.disabled).toBe(true);
  });

  it('в «картинке в картинке» — только сцена', () => {
    const renderer = render(sharing({ pipActive: true }));
    expect(renderer.root.findAll((node) => node.props.accessibilityLabel === 'Остальные в звонке')).toHaveLength(0);
    expect(views(renderer).map((v) => v.props.streamURL)).toEqual(['stream-b']);
  });

  it('без показа — обычная сетка', () => {
    const renderer = render(
      api(room([participant('me'), participant('b', { video: true })]), {
        remoteStreams: { b: stream('b') } as unknown as GroupCallsApi['remoteStreams'],
      }),
    );
    expect(renderer.root.findAll((node) => node.props.accessibilityLabel === 'Остальные в звонке')).toHaveLength(0);
    expect(renderer.root.find((node) => node.props.accessibilityLabel === 'Кто в звонке')).toBeTruthy();
  });
});

describe('свой показ экрана (Android)', () => {
  it('кнопка есть, где телефон умеет показ, и начинает его', () => {
    const value = api(room([participant('me'), participant('b')]), { screenSupported: true });
    const renderer = render(value);
    act(() => buttonMatching(renderer, /^Показать экран$/).props.onPress());
    expect(value.toggleScreenShare).toHaveBeenCalled();
  });

  it('на телефоне без показа кнопки нет', () => {
    const renderer = render(api(room([participant('me'), participant('b')])));
    expect(() => buttonMatching(renderer, /Показать экран/)).toThrow();
  });

  it('показывает другой — кнопка называет кого', () => {
    const renderer = render(
      api(room([participant('me'), participant('b', { video: true, screen: true })]), {
        screenSupported: true,
        remoteStreams: { b: stream('b') } as unknown as GroupCallsApi['remoteStreams'],
      }),
    );
    expect(buttonMatching(renderer, /^Показать экран нельзя: Экран показывает Имя b$/)).toBeTruthy();
  });

  it('свой показ: «Остановить показ», своя плитка — без живого превью', () => {
    const value = api(room([participant('me', { video: true, screen: true }), participant('b')]), {
      screenSupported: true,
      screenOn: true,
      sendingVideo: true,
      localScreenStream: stream('me-screen') as unknown as GroupCallsApi['localScreenStream'],
    });
    const renderer = render(value);
    expect(screenText(renderer)).toContain('Остальные видят ваш экран');
    expect(screenText(renderer)).toContain('Вы показываете экран');
    expect(views(renderer).map((v) => v.props.streamURL)).not.toContain('stream-me-screen');
    act(() => buttonMatching(renderer, /^Остановить показ экрана$/).props.onPress());
    expect(value.toggleScreenShare).toHaveBeenCalledTimes(1);
  });

  it('камера во время показа решает, вернётся ли она, и перевернуть её нельзя', () => {
    const renderer = render(
      api(room([participant('me', { video: true, screen: true })]), {
        screenSupported: true,
        screenOn: true,
        cameraOn: true,
        sendingVideo: true,
      }),
    );
    expect(buttonMatching(renderer, /^Не включать камеру после показа экрана$/)).toBeTruthy();
    expect(() => buttonMatching(renderer, /Перевернуть камеру/)).toThrow();
  });
});
