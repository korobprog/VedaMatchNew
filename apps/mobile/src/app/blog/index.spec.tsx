import type { BlogFeedResponse } from '@vedamatch/shared';
import { FlatList } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { ApiError } from '@/lib/api/client';
import { announceBlogChange, resetBlogChanges } from '@/lib/blog/blog-changes';
import { blogPost } from '@/lib/blog/blog-fixtures';
import { pressable, pressables, screenText } from '@/components/blog/blog-test-helpers';
import BlogFeedScreen from './index';

const mockFeed = jest.fn<Promise<BlogFeedResponse>, [string, string | null | undefined]>();
const mockRead = jest.fn<Promise<boolean>, [string]>();
const mockWrite = jest.fn<Promise<void>, [string, boolean]>(async () => undefined);

jest.mock('expo-router', () => {
  const { useEffect } = jest.requireActual('react');
  return {
    __esModule: true,
    useFocusEffect: (callback: () => void) => useEffect(callback, [callback]),
    router: { push: jest.fn() },
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
jest.mock('@/config/app-variant', () => ({ __esModule: true, appVariant: () => ({ webOrigin: 'https://vedamatch.ru' }) }));
jest.mock('expo-clipboard', () => ({ __esModule: true, setStringAsync: jest.fn(async () => true) }));
const fakeSession = { api: {}, user: { id: 'u-1' } };
jest.mock('@/lib/auth/session', () => ({ __esModule: true, useSession: () => fakeSession }));
jest.mock('@/lib/blog/blog-api', () => ({
  __esModule: true,
  createBlogApi: () => ({
    feed: (scope: string, cursor?: string | null) => mockFeed(scope, cursor),
    repost: jest.fn(),
    remove: jest.fn(),
  }),
}));
jest.mock('@/lib/blog/blog-home-visibility', () => ({
  __esModule: true,
  readBlogHomeVisible: (userId: string) => mockRead(userId),
  writeBlogHomeVisible: (userId: string, visible: boolean) => mockWrite(userId, visible),
}));

const mounted: ReactTestRenderer[] = [];

async function render(): Promise<ReactTestRenderer> {
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(<BlogFeedScreen />);
  });
  mounted.push(renderer);
  return renderer;
}

async function scrollToEnd(renderer: ReactTestRenderer) {
  await act(async () => renderer.root.findByType(FlatList).props.onEndReached());
}

beforeEach(() => {
  jest.clearAllMocks();
  resetBlogChanges();
  mockRead.mockResolvedValue(true);
});
afterEach(() => {
  for (const renderer of mounted.splice(0)) act(() => renderer.unmount());
});

describe('экран блог-ленты', () => {
  it('открывает всю ленту с архивом (scope=all), как сайт', async () => {
    mockFeed.mockResolvedValue({ posts: [blogPost('a', { title: 'Киртан' })], nextCursor: null });
    const renderer = await render();
    expect(mockFeed).toHaveBeenCalledWith('all', null);
    expect(screenText(renderer)).toContain('Киртан');
    expect(screenText(renderer)).toContain('Это все посты.');
  });

  it('пока первая порция не пришла — скелет, а не «пусто»', async () => {
    mockFeed.mockReturnValue(new Promise(() => undefined));
    const renderer = await render();
    expect(screenText(renderer)).not.toContain('Здесь пока пусто');
    expect(renderer.root.findAll((node) => node.props?.accessibilityLabel === 'Загружаем ленту').length).toBeGreaterThan(0);
  });

  it('пустая лента — приглашение написать первый пост', async () => {
    mockFeed.mockResolvedValue({ posts: [], nextCursor: null });
    const renderer = await render();
    expect(screenText(renderer)).toContain('Здесь пока пусто. Напишите первый пост');
  });

  it('первая загрузка упала — ошибка словами и «Повторить», который грузит заново', async () => {
    mockFeed.mockRejectedValueOnce(new ApiError(503, 'Service Unavailable', null));
    const renderer = await render();
    expect(screenText(renderer)).toContain('Сервер временно недоступен. Попробуйте позже.');
    mockFeed.mockResolvedValueOnce({ posts: [blogPost('a', { title: 'Вернулось' })], nextCursor: null });
    await act(async () => pressable(renderer, 'Повторить').props.onPress());
    expect(screenText(renderer)).toContain('Вернулось');
  });

  it('прокрутка до конца подгружает следующую порцию по курсору, без повторов', async () => {
    mockFeed.mockResolvedValueOnce({ posts: [blogPost('a', { title: 'Первый' })], nextCursor: 'c1' });
    const renderer = await render();
    mockFeed.mockResolvedValueOnce({
      posts: [blogPost('a', { title: 'Первый' }), blogPost('b', { title: 'Второй' })],
      nextCursor: null,
    });
    await scrollToEnd(renderer);
    expect(mockFeed).toHaveBeenLastCalledWith('all', 'c1');
    const text = screenText(renderer);
    expect(text.match(/Первый/g)).toHaveLength(1);
    expect(text).toContain('Второй');
    // Курсора больше нет — лишний запрос в конце ленты не уходит.
    await scrollToEnd(renderer);
    expect(mockFeed).toHaveBeenCalledTimes(2);
  });

  it('продолжение не пришло — лента остаётся, под ней ошибка и «Повторить»', async () => {
    mockFeed.mockResolvedValueOnce({ posts: [blogPost('a', { title: 'Первый' })], nextCursor: 'c1' });
    const renderer = await render();
    mockFeed.mockRejectedValueOnce(new TypeError('network'));
    await scrollToEnd(renderer);
    const text = screenText(renderer);
    expect(text).toContain('Первый');
    expect(text).toContain('Нет соединения с сервером.');
    mockFeed.mockResolvedValueOnce({ posts: [blogPost('b', { title: 'Второй' })], nextCursor: null });
    await act(async () => pressable(renderer, 'Повторить').props.onPress());
    // Порция дописывается к ленте, а не заменяет её.
    expect(screenText(renderer)).toContain('Первый');
    expect(screenText(renderer)).toContain('Второй');
  });

  it('свой новый пост встаёт сверху сразу, без перезагрузки', async () => {
    mockFeed.mockResolvedValue({ posts: [blogPost('a', { title: 'Старый' })], nextCursor: null });
    const renderer = await render();
    act(() => announceBlogChange({ kind: 'created', post: blogPost('n', { title: 'Новый' }) }));
    const text = screenText(renderer);
    expect(text.indexOf('Новый')).toBeLessThan(text.indexOf('Старый'));
    expect(mockFeed).toHaveBeenCalledTimes(1);
  });

  it('полосу, убранную из «Чатов», возвращают отсюда', async () => {
    mockRead.mockResolvedValue(false);
    mockFeed.mockResolvedValue({ posts: [], nextCursor: null });
    const renderer = await render();
    expect(screenText(renderer)).toContain('Лента убрана из «Чатов».');
    await act(async () => pressable(renderer, 'Вернуть ленту в «Чаты»').props.onPress());
    expect(mockWrite).toHaveBeenCalledWith('u-1', true);
    expect(pressables(renderer, 'Вернуть ленту')).toHaveLength(0);
  });
});
