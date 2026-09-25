import type { UnionConnectionRequestsState } from '@vedamatch/shared';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { pressable, screenText } from '@/components/union/union-test-helpers';
import { ApiError } from '@/lib/api/client';
import { unionRequest, unionUser } from '@/lib/union/union-fixtures';
import UnionLikesScreen from './likes';

const mockRequests = jest.fn<Promise<UnionConnectionRequestsState>, []>();
const mockFavorites = jest.fn<Promise<{ userIds: string[] }>, []>();
const mockRespond = jest.fn<Promise<unknown>, [string, string]>(async () => ({}));
const mockSetFavorite = jest.fn<Promise<unknown>, [string, boolean]>(async () => ({}));
const mockPush = jest.fn();

jest.mock('expo-router', () => {
  const { useEffect } = jest.requireActual('react');
  return {
    __esModule: true,
    useFocusEffect: (callback: () => void) => useEffect(callback, [callback]),
    router: { push: (...args: unknown[]) => mockPush(...args), replace: jest.fn() },
    Stack: { Screen: () => null },
  };
});
jest.mock('react-native-safe-area-context', () => ({
  __esModule: true,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('@/theme/theme', () => ({
  __esModule: true,
  useTheme: () => ({ colors: jest.requireActual('@/theme/tokens').light }),
}));
const fakeSession = { api: {}, user: { id: 'me' } };
jest.mock('@/lib/auth/session', () => ({ __esModule: true, useSession: () => fakeSession }));
jest.mock('@/lib/union/union-api', () => ({
  __esModule: true,
  createUnionApi: () => ({
    connectionRequests: () => mockRequests(),
    favorites: () => mockFavorites(),
    connectionCounts: async () => ({ incomingPending: 0 }),
    respond: (id: string, action: string) => mockRespond(id, action),
    setFavorite: (id: string, value: boolean) => mockSetFavorite(id, value),
  }),
}));

const mounted: ReactTestRenderer[] = [];
async function render(): Promise<ReactTestRenderer> {
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(<UnionLikesScreen />);
  });
  mounted.push(renderer);
  return renderer;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockFavorites.mockResolvedValue({ userIds: [] });
});
afterEach(() => {
  for (const renderer of mounted.splice(0)) act(() => renderer.unmount());
});

const state = (): UnionConnectionRequestsState => ({
  incoming: [
    unionRequest({ id: 'r-old', userId: 'u-old', createdAt: '2026-09-01T00:00:00Z' }),
    { ...unionRequest({ id: 'r-super', createdAt: '2026-08-01T00:00:00Z', isSuperlike: true }), user: unionUser({ id: 'u-super', name: 'Говинда' }) },
    unionRequest({ id: 'r-done', status: 'accepted' }),
  ],
  outgoing: [],
});

describe('экран «Лайки»', () => {
  it('показывает только ждущих ответа, суперлайк — первым', async () => {
    mockRequests.mockResolvedValue(state());
    const renderer = await render();
    const text = screenText(renderer);
    expect(text).toContain('Говинда');
    expect(text.indexOf('Говинда')).toBeLessThan(text.indexOf('Радха'));
    expect(text).toContain('Суперлайк');
  });

  it('«Ответить взаимностью» принимает заявку и перечитывает список', async () => {
    mockRequests.mockResolvedValue(state());
    const renderer = await render();
    await act(async () => pressable(renderer, 'Ответить взаимностью').props.onPress());
    expect(mockRespond).toHaveBeenCalledWith('r-super', 'accept');
    expect(mockRequests).toHaveBeenCalledTimes(2);
  });

  it('звёздочка загорается сразу и гаснет, если сервер отказал', async () => {
    mockRequests.mockResolvedValue(state());
    mockSetFavorite.mockRejectedValueOnce(new ApiError(500, 'x', null));
    const renderer = await render();
    await act(async () => pressable(renderer, 'Отметить как особенно понравившегося').props.onPress());
    expect(mockSetFavorite).toHaveBeenCalledWith('u-super', true);
    expect(screenText(renderer)).toContain('Не удалось изменить избранное.');
    expect(() => pressable(renderer, 'Убрать из избранного')).toThrow();
  });

  it('пусто — объясняет, что делать, а не показывает голый экран', async () => {
    mockRequests.mockResolvedValue({ incoming: [], outgoing: [] });
    const renderer = await render();
    expect(screenText(renderer)).toContain('Пока никто не проявил интерес');
  });

  it('не загрузилось — текст и «Повторить»', async () => {
    mockRequests.mockRejectedValueOnce(new ApiError(502, 'Bad Gateway', null));
    const renderer = await render();
    expect(screenText(renderer)).toContain('Сервер временно недоступен');
    mockRequests.mockResolvedValue(state());
    await act(async () => pressable(renderer, 'Повторить').props.onPress());
    expect(screenText(renderer)).toContain('Говинда');
  });

  it('тап по фото открывает анкету человека', async () => {
    mockRequests.mockResolvedValue(state());
    const renderer = await render();
    await act(async () => pressable(renderer, /Говинда, суперлайк/).props.onPress());
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/union/users/[id]', params: { id: 'u-super' } });
  });
});
