import type { BlogHomeFeedResponse } from '@vedamatch/shared';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { announceBlogChange, resetBlogChanges } from '@/lib/blog/blog-changes';
import { blogPost } from '@/lib/blog/blog-fixtures';
import { BlogHomeStrip } from './blog-home-strip';
import { pressable, pressables, screenText } from './blog-test-helpers';

const mockHome = jest.fn<Promise<BlogHomeFeedResponse>, []>();
const mockRead = jest.fn<Promise<boolean>, [string]>();
const mockWrite = jest.fn<Promise<void>, [string, boolean]>(async () => undefined);
const mockOpenPost = jest.fn();
const mockOpenFeed = jest.fn();
const mockOpenComposer = jest.fn();

jest.mock('expo-router', () => {
  const { useEffect } = jest.requireActual('react');
  return { __esModule: true, useFocusEffect: (callback: () => void) => useEffect(callback, [callback]) };
});
jest.mock('@/theme/theme', () => ({
  __esModule: true,
  useTheme: () => ({ colors: jest.requireActual('@/theme/tokens').light }),
}));
const fakeSession = { api: {}, user: { id: 'u-1' } };
jest.mock('@/lib/auth/session', () => ({ __esModule: true, useSession: () => fakeSession }));
jest.mock('@/lib/blog/blog-api', () => ({ __esModule: true, createBlogApi: () => ({ home: () => mockHome() }) }));
jest.mock('@/lib/blog/blog-home-visibility', () => ({
  __esModule: true,
  readBlogHomeVisible: (userId: string) => mockRead(userId),
  writeBlogHomeVisible: (userId: string, visible: boolean) => mockWrite(userId, visible),
}));
jest.mock('@/lib/blog/blog-routes', () => ({
  __esModule: true,
  openBlogPost: (id: string) => mockOpenPost(id),
  openBlogFeed: () => mockOpenFeed(),
  openBlogComposer: () => mockOpenComposer(),
}));

const mounted: ReactTestRenderer[] = [];

async function render(): Promise<ReactTestRenderer> {
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(<BlogHomeStrip />);
  });
  mounted.push(renderer);
  return renderer;
}

// Горизонтальный список досчитывает раскладку после теста — снимаем его сами.
afterEach(() => {
  for (const renderer of mounted.splice(0)) act(() => renderer.unmount());
});

beforeEach(() => {
  jest.clearAllMocks();
  resetBlogChanges();
  mockRead.mockResolvedValue(true);
});

describe('полоса блог-ленты в «Чатах»', () => {
  it('показывает начало ленты: плитки с заголовками и «Вся лента» со счётом', async () => {
    mockHome.mockResolvedValue({ posts: [blogPost('a', { title: 'Киртан' }), blogPost('b', { title: 'Прасад' })], total: 9 });
    const renderer = await render();
    const text = screenText(renderer);
    expect(text).toContain('Блог-лента');
    expect(text).toContain('Киртан');
    expect(text).toContain('Прасад');
    expect(text).toContain('Вся лента · ещё 7 постов');
  });

  it('плитка открывает ЭТОТ пост, «Вся лента» — ленту, «Написать» — форму', async () => {
    mockHome.mockResolvedValue({ posts: [blogPost('a', { title: 'Киртан' })], total: 1 });
    const renderer = await render();
    act(() => pressable(renderer, 'Киртан. Маму Тхакур дас. Открыть пост').props.onPress());
    expect(mockOpenPost).toHaveBeenCalledWith('a');
    act(() => pressable(renderer, 'Вся лента').props.onPress());
    expect(mockOpenFeed).toHaveBeenCalled();
    act(() => pressable(renderer, 'Написать').props.onPress());
    expect(mockOpenComposer).toHaveBeenCalled();
  });

  it('скрытая полоса не рисует ничего и не ходит на сервер — «Чаты» как до ленты', async () => {
    mockRead.mockResolvedValue(false);
    const renderer = await render();
    expect(renderer.toJSON()).toBeNull();
    expect(mockHome).not.toHaveBeenCalled();
  });

  it('«Скрыть» убирает полосу сразу и запоминает выбор этого человека', async () => {
    mockHome.mockResolvedValue({ posts: [blogPost('a')], total: 1 });
    const renderer = await render();
    await act(async () => pressable(renderer, 'Скрыть').props.onPress());
    expect(renderer.toJSON()).toBeNull();
    expect(mockWrite).toHaveBeenCalledWith('u-1', false);
  });

  it('сервис упал — полоса молча уходит, переписке она не мешает', async () => {
    mockHome.mockRejectedValue(new Error('502'));
    const renderer = await render();
    expect(renderer.toJSON()).toBeNull();
  });

  it('пустая лента — приглашение написать первый пост, без «Вся лента»', async () => {
    mockHome.mockResolvedValue({ posts: [], total: 0 });
    const renderer = await render();
    expect(screenText(renderer)).toContain('В ленте пока пусто');
    expect(pressables(renderer, 'Вся лента')).toHaveLength(0);
  });

  it('опубликованный на соседнем экране пост появляется сразу, полоса не растёт больше четырёх', async () => {
    mockHome.mockResolvedValue({ posts: ['a', 'b', 'c', 'd'].map((id) => blogPost(id, { title: `Пост ${id}` })), total: 4 });
    const renderer = await render();
    act(() => announceBlogChange({ kind: 'created', post: blogPost('new', { title: 'Свежий' }) }));
    const text = screenText(renderer);
    expect(text).toContain('Свежий');
    expect(text).not.toContain('Пост d');
    expect(text).toContain('Вся лента · ещё 1 пост');
  });
});
