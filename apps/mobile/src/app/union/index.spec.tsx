import type { UnionProfileState } from '@vedamatch/shared';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { pressable, screenText } from '@/components/union/union-test-helpers';
import { ApiError } from '@/lib/api/client';
import UnionEntryScreen from './index';

const mockMe = jest.fn();
const mockState = jest.fn<Promise<UnionProfileState>, []>();
const mockReplace = jest.fn();

jest.mock('expo-router', () => {
  const { useEffect } = jest.requireActual('react');
  return {
    __esModule: true,
    useFocusEffect: (callback: () => void) => useEffect(callback, [callback]),
    router: { replace: (...args: unknown[]) => mockReplace(...args), push: jest.fn() },
    Stack: { Screen: () => null },
  };
});
jest.mock('@/theme/theme', () => ({
  __esModule: true,
  useTheme: () => ({ colors: jest.requireActual('@/theme/tokens').light }),
}));
const fakeSession = { api: {}, user: { id: 'me' } };
jest.mock('@/lib/auth/session', () => ({ __esModule: true, useSession: () => fakeSession }));
jest.mock('@/lib/profile/profile-api', () => ({ __esModule: true, createProfileApi: () => ({ me: () => mockMe() }) }));
jest.mock('@/lib/union/union-api', () => ({
  __esModule: true,
  createUnionApi: () => ({ profileState: () => mockState() }),
}));

const HOME = { city: 'Казань', country: 'Россия', lat: 55.8, lon: 49.1 };
const NO_PROFILE: UnionProfileState = {
  profile: null,
  completeness: { percent: 0, items: [], missing: [], next: null },
};
const WITH_PROFILE = { ...NO_PROFILE, profile: { id: 'p' } as UnionProfileState['profile'] };

const mounted: ReactTestRenderer[] = [];
async function render(): Promise<ReactTestRenderer> {
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(<UnionEntryScreen />);
  });
  mounted.push(renderer);
  return renderer;
}

beforeEach(() => jest.clearAllMocks());
afterEach(() => {
  for (const renderer of mounted.splice(0)) act(() => renderer.unmount());
});

describe('вход в Знакомства', () => {
  it('место и анкета есть — сразу в подбор', async () => {
    mockMe.mockResolvedValue({ homeLocation: HOME });
    mockState.mockResolvedValue(WITH_PROFILE);
    await render();
    expect(mockReplace).toHaveBeenCalledWith('/union/recommendations');
  });

  it('без места — сначала место, даже если анкета есть', async () => {
    mockMe.mockResolvedValue({ homeLocation: null });
    mockState.mockResolvedValue(WITH_PROFILE);
    await render();
    expect(mockReplace).toHaveBeenCalledWith('/union/location');
  });

  it('без анкеты — анкета', async () => {
    mockMe.mockResolvedValue({ homeLocation: HOME });
    mockState.mockResolvedValue(NO_PROFILE);
    await render();
    expect(mockReplace).toHaveBeenCalledWith('/union/profile');
  });

  it('не загрузилось — текст и «Повторить», без перехода', async () => {
    mockMe.mockRejectedValueOnce(new ApiError(502, 'Bad Gateway', null));
    mockState.mockResolvedValue(WITH_PROFILE);
    const renderer = await render();
    expect(mockReplace).not.toHaveBeenCalled();
    expect(screenText(renderer)).toContain('Сервер временно недоступен');
    mockMe.mockResolvedValue({ homeLocation: HOME });
    await act(async () => pressable(renderer, 'Повторить').props.onPress());
    expect(mockReplace).toHaveBeenCalledWith('/union/recommendations');
  });
});
