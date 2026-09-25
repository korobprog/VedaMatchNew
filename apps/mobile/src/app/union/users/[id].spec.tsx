import type { UnionRecommendation } from '@vedamatch/shared';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { pressable, pressables, screenText } from '@/components/union/union-test-helpers';
import { ApiError } from '@/lib/api/client';
import { unionRecommendation } from '@/lib/union/union-fixtures';
import UnionUserScreen from './[id]';

const mockCard = jest.fn<Promise<UnionRecommendation>, [string]>();
const mockConnect = jest.fn<Promise<unknown>, [unknown]>(async () => ({}));
const mockRespond = jest.fn<Promise<unknown>, [string, string]>(async () => ({}));
const mockBlock = jest.fn<Promise<unknown>, [string]>(async () => ({}));
const mockCreateDirect = jest.fn<Promise<{ id: string }>, [string]>(async () => ({ id: 'c-9' }));
const mockPush = jest.fn();
const mockBack = jest.fn();

// Штатный мок Reanimated тянет нативные worklets; карусели нужен только флаг
// «уменьшить движение».
jest.mock('react-native-reanimated', () => ({ __esModule: true, useReducedMotion: () => true }));
jest.mock('expo-router', () => ({
  __esModule: true,
  useLocalSearchParams: () => ({ id: 'u-7' }),
  router: {
    push: (...args: unknown[]) => mockPush(...args),
    back: () => mockBack(),
    canGoBack: () => true,
    replace: jest.fn(),
  },
  Stack: { Screen: () => null },
}));
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
jest.mock('@/lib/chat/chat-api', () => ({
  __esModule: true,
  createChatApi: () => ({ createDirect: (id: string) => mockCreateDirect(id) }),
}));
jest.mock('@/lib/union/union-api', () => ({
  __esModule: true,
  createUnionApi: () => ({
    userCard: (id: string) => mockCard(id),
    createConnection: (body: unknown) => mockConnect(body),
    respond: (id: string, action: string) => mockRespond(id, action),
    block: (id: string) => mockBlock(id),
  }),
}));

const mounted: ReactTestRenderer[] = [];
async function render(): Promise<ReactTestRenderer> {
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(<UnionUserScreen />);
  });
  mounted.push(renderer);
  return renderer;
}

beforeEach(() => jest.clearAllMocks());
afterEach(() => {
  for (const renderer of mounted.splice(0)) act(() => renderer.unmount());
});

const card = (overrides: Partial<UnionRecommendation> = {}) =>
  unionRecommendation({ id: 'u-7', name: 'Вриндаван', age: 29, city: 'Казань' }, overrides);

describe('анкета человека', () => {
  it('показывает имя, возраст, строку под именем и процент', async () => {
    mockCard.mockResolvedValue(card());
    const renderer = await render();
    const text = screenText(renderer);
    expect(mockCard).toHaveBeenCalledWith('u-7');
    expect(text).toContain('Вриндаван, 29');
    expect(text).toContain('29 лет · Казань · Преданный');
    expect(text).toContain('72%');
  });

  it('без связи — «Познакомиться» отправляет заявку и перечитывает анкету', async () => {
    mockCard.mockResolvedValue(card());
    const renderer = await render();
    await act(async () => pressable(renderer, 'Познакомиться').props.onPress());
    expect(mockConnect).toHaveBeenCalledWith({ toUserId: 'u-7' });
    expect(mockCard).toHaveBeenCalledTimes(2);
  });

  it('входящая заявка — принять и отклонить прямо здесь', async () => {
    mockCard.mockResolvedValue(
      card({
        connection: {
          id: 'req-1',
          status: 'pending',
          direction: 'incoming',
          isSuperlike: true,
          message: 'Харе Кришна!',
          createdAt: '2026-09-20T00:00:00Z',
          respondedAt: null,
        },
      }),
    );
    const renderer = await render();
    expect(screenText(renderer)).toContain('Вам суперлайк!');
    expect(screenText(renderer)).toContain('Харе Кришна!');
    await act(async () => pressable(renderer, 'Принять').props.onPress());
    expect(mockRespond).toHaveBeenCalledWith('req-1', 'accept');
  });

  it('взаимно — «Написать» открывает переписку в «Чатах» приложения', async () => {
    mockCard.mockResolvedValue(
      card({
        connection: {
          id: 'req-1',
          status: 'accepted',
          direction: 'outgoing',
          isSuperlike: false,
          message: null,
          createdAt: '2026-09-20T00:00:00Z',
          respondedAt: '2026-09-21T00:00:00Z',
        },
      }),
    );
    const renderer = await render();
    await act(async () => pressable(renderer, 'Написать Вриндаван').props.onPress());
    expect(mockCreateDirect).toHaveBeenCalledWith('u-7');
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/chat/[id]', params: { id: 'c-9' } });
  });

  it('отправленный запрос — без кнопки, но с объяснением', async () => {
    mockCard.mockResolvedValue(
      card({
        connection: {
          id: 'req-1',
          status: 'pending',
          direction: 'outgoing',
          isSuperlike: false,
          message: null,
          createdAt: '2026-09-20T00:00:00Z',
          respondedAt: null,
        },
      }),
    );
    const renderer = await render();
    expect(screenText(renderer)).toContain('Запрос на знакомство отправлен');
    expect(pressables(renderer, 'Познакомиться')).toHaveLength(0);
  });

  it('блокировка — только после подтверждения, затем назад', async () => {
    mockCard.mockResolvedValue(card());
    const renderer = await render();
    await act(async () => pressable(renderer, 'Заблокировать').props.onPress());
    expect(mockBlock).not.toHaveBeenCalled();
    const confirm = pressables(renderer, 'Заблокировать');
    await act(async () => confirm[confirm.length - 1].props.onPress());
    expect(mockBlock).toHaveBeenCalledWith('u-7');
    expect(mockBack).toHaveBeenCalled();
  });

  it('жалоба — свой экран с именем человека', async () => {
    mockCard.mockResolvedValue(card());
    const renderer = await render();
    await act(async () => pressable(renderer, 'Пожаловаться').props.onPress());
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/union/report/[id]', params: { id: 'u-7', name: 'Вриндаван' } });
  });

  it('своя анкета — без процента и без действий', async () => {
    mockCard.mockResolvedValue(unionRecommendation({ id: 'me', name: 'Я' }));
    const renderer = await render();
    expect(screenText(renderer)).toContain('Это ваша анкета');
    expect(pressables(renderer, 'Познакомиться')).toHaveLength(0);
    expect(pressables(renderer, 'Пожаловаться')).toHaveLength(0);
  });

  it('404 — анкета недоступна, причину не называем', async () => {
    mockCard.mockRejectedValue(new ApiError(404, 'Not Found', null));
    const renderer = await render();
    expect(screenText(renderer)).toContain('Анкета недоступна');
  });
});
