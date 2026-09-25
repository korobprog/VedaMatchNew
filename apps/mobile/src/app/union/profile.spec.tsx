import type { UnionProfileDto, UnionProfileState, UnionProfileUpdateRequest } from '@vedamatch/shared';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { pressable, pressables, screenText } from '@/components/union/union-test-helpers';
import UnionProfileScreen from './profile';

const mockMe = jest.fn();
const mockState = jest.fn<Promise<UnionProfileState>, []>();
const mockUpdate = jest.fn<Promise<UnionProfileState>, [UnionProfileUpdateRequest]>();
const mockSaveStatus = jest.fn<Promise<unknown>, [string | null]>(async () => ({}));
const mockReplace = jest.fn();
const mockPush = jest.fn();

jest.mock('expo-router', () => {
  const { useEffect } = jest.requireActual('react');
  return {
    __esModule: true,
    useFocusEffect: (callback: () => void) => useEffect(callback, [callback]),
    router: { replace: (...args: unknown[]) => mockReplace(...args), push: (...args: unknown[]) => mockPush(...args) },
    Stack: { Screen: () => null },
  };
});
jest.mock('react-native-safe-area-context', () => ({
  __esModule: true,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('@/components/keyboard-controller-web', () => {
  const { ScrollView } = jest.requireActual('react-native');
  return { __esModule: true, PersonKeyboardAwareScroll: ScrollView };
});
jest.mock('expo-image-picker', () => ({ __esModule: true }));
jest.mock('@/theme/theme', () => ({
  __esModule: true,
  useTheme: () => ({ colors: jest.requireActual('@/theme/tokens').light }),
}));
const fakeSession = { api: {}, user: { id: 'me' } };
jest.mock('@/lib/auth/session', () => ({ __esModule: true, useSession: () => fakeSession }));
jest.mock('@/lib/profile/profile-api', () => ({ __esModule: true, createProfileApi: () => ({ me: () => mockMe() }) }));
jest.mock('@/lib/union/union-api', () => ({
  __esModule: true,
  createUnionApi: () => ({
    profileState: () => mockState(),
    updateProfile: (body: UnionProfileUpdateRequest) => mockUpdate(body),
    saveStatusLine: (value: string | null) => mockSaveStatus(value),
    generateText: jest.fn(),
    connectionCounts: async () => ({ incomingPending: 0 }),
    gallery: async () => ({ photos: [], usedBytes: 0, quotaBytes: 0 }),
  }),
}));

const ME = {
  id: 'me',
  age: 30,
  gender: 'male',
  statusLine: 'Харе Кришна',
  about: 'Люблю киртан',
  homeLocation: { city: 'Казань', country: 'Россия', lat: 55.8, lon: 49.1 },
};
const COMPLETENESS = { percent: 40, items: [{ key: 'photos' as const, weight: 20, filled: false }], missing: [], next: null };

function profile(overrides: Partial<UnionProfileDto> = {}): UnionProfileDto {
  return {
    id: 'p',
    userId: 'me',
    about: null,
    relocationReady: false,
    format: 'any',
    languages: [],
    skills: [],
    interests: [],
    values: [],
    familyStatus: null,
    privacy: null,
    isActive: true,
    showcaseOptIn: false,
    showcaseBlocked: false,
    requestsFromVerifiedOnly: false,
    contactMode: 'requests',
    familySeeksGender: null,
    intentions: [{ type: 'friendship', weight: 100 }],
    createdAt: '2026-09-01T00:00:00Z',
    updatedAt: '2026-09-01T00:00:00Z',
    status: null,
    heightCm: null,
    diet: null,
    regulativePrinciples: [],
    childrenStatus: null,
    education: null,
    spiritualEducation: null,
    housing: null,
    income: null,
    pets: [],
    ageRangeMin: null,
    ageRangeMax: null,
    ...overrides,
  };
}

const mounted: ReactTestRenderer[] = [];
async function render(): Promise<ReactTestRenderer> {
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(<UnionProfileScreen />);
  });
  mounted.push(renderer);
  return renderer;
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  mockMe.mockResolvedValue(ME);
  mockUpdate.mockImplementation(async () => ({ profile: profile(), completeness: { ...COMPLETENESS, percent: 55 } }));
});
afterEach(() => {
  for (const renderer of mounted.splice(0)) act(() => renderer.unmount());
  jest.useRealTimers();
});

async function tick(ms = 700) {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
}

describe('своя анкета', () => {
  it('без места — сначала место', async () => {
    mockMe.mockResolvedValue({ ...ME, homeLocation: null });
    mockState.mockResolvedValue({ profile: null, completeness: COMPLETENESS });
    await render();
    expect(mockReplace).toHaveBeenCalledWith('/union/location');
  });

  it('показывает заполненность, подсказку про фото и портальные статус и «о себе»', async () => {
    mockState.mockResolvedValue({ profile: profile(), completeness: COMPLETENESS });
    const renderer = await render();
    const text = screenText(renderer);
    expect(text).toContain('Заполнена на 40%');
    expect(text).toContain('Анкеты с фото показываются выше');
    expect(text).toContain('Люблю киртан');
  });

  it('выбор поля копится и уходит одним PUT с целями', async () => {
    mockState.mockResolvedValue({ profile: profile(), completeness: COMPLETENESS });
    const renderer = await render();
    await act(async () => pressable(renderer, 'только прасад').props.onPress());
    await act(async () => pressable(renderer, 'снимаю').props.onPress());
    expect(mockUpdate).not.toHaveBeenCalled();
    await tick();
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(mockUpdate).toHaveBeenCalledWith({
      diet: 'prasadam_only',
      housing: 'rent',
      intentions: [{ type: 'friendship', weight: 100 }],
    });
    expect(screenText(renderer)).toContain('Заполнена на 55%');
  });

  it('повторное касание выбранного снимает выбор', async () => {
    mockState.mockResolvedValue({ profile: profile({ diet: 'vegan' }), completeness: COMPLETENESS });
    const renderer = await render();
    await act(async () => pressable(renderer, 'веганство').props.onPress());
    await tick();
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ diet: null }));
  });

  it('пока сумма целей не 100 — правки ждут, выровняли — уходят', async () => {
    mockState.mockResolvedValue({
      profile: profile({ intentions: [{ type: 'family', weight: 70 }, { type: 'service', weight: 30 }] }),
      completeness: COMPLETENESS,
    });
    const renderer = await render();
    // Ручные веса — анкета открывается в процентах.
    await act(async () => pressable(renderer, 'Создание семьи: больше на 5%').props.onPress());
    await tick();
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(screenText(renderer)).toContain('должна быть 100%');
    await act(async () => pressable(renderer, 'Выровнять до 100%').props.onPress());
    await tick();
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    const body = mockUpdate.mock.calls[0][0];
    expect(body.intentions.reduce((sum, item) => sum + item.weight, 0)).toBe(100);
  });

  it('статус уходит в портальный профиль сразу, без задержки анкеты', async () => {
    mockState.mockResolvedValue({ profile: profile(), completeness: COMPLETENESS });
    const renderer = await render();
    const input = renderer.root.findByProps({ accessibilityLabel: 'Короткий статус' });
    await act(async () => input.props.onChangeText('Ищу единомышленников'));
    await act(async () => pressable(renderer, 'Сохранить статус').props.onPress());
    expect(mockSaveStatus).toHaveBeenCalledWith('Ищу единомышленников');
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('рост вне пределов — ошибка словами, в анкету не уходит', async () => {
    mockState.mockResolvedValue({ profile: profile(), completeness: COMPLETENESS });
    const renderer = await render();
    const input = renderer.root.findByProps({ accessibilityLabel: 'Рост в сантиметрах' });
    await act(async () => input.props.onChangeText('300'));
    await act(async () => pressables(renderer, 'Применить')[1].props.onPress());
    await tick();
    expect(screenText(renderer)).toContain('Рост: От 120 до 230.');
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('новичок создаёт анкету кнопкой и видит переход к анкетам', async () => {
    mockState.mockResolvedValue({ profile: null, completeness: { ...COMPLETENESS, percent: 0 } });
    const renderer = await render();
    expect(screenText(renderer)).toContain('Добро пожаловать!');
    await act(async () => pressable(renderer, 'Создать анкету').props.onPress());
    expect(mockUpdate).toHaveBeenCalledWith({
      intentions: [
        { type: 'family', weight: 25 },
        { type: 'business', weight: 25 },
        { type: 'friendship', weight: 25 },
        { type: 'service', weight: 25 },
      ],
    });
    expect(pressables(renderer, 'Смотреть анкеты')).toHaveLength(1);
  });

  it('ушли с экрана раньше задержки — правка всё равно сохраняется', async () => {
    mockState.mockResolvedValue({ profile: profile(), completeness: COMPLETENESS });
    const renderer = await render();
    await act(async () => pressable(renderer, 'только прасад').props.onPress());
    act(() => renderer.unmount());
    mounted.splice(mounted.indexOf(renderer), 1);
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ diet: 'prasadam_only' }));
  });

  it('«Как меня видят» открывает свою анкету чужими глазами', async () => {
    mockState.mockResolvedValue({ profile: profile(), completeness: COMPLETENESS });
    const renderer = await render();
    await act(async () => pressable(renderer, 'Как меня видят').props.onPress());
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/union/users/[id]', params: { id: 'me' } });
  });
});
