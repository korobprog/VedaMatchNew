import type { BlogHomeFeedResponse } from '@vedamatch/shared';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { announceBlogChange, resetBlogChanges } from '@/lib/blog/blog-changes';
import { blogPost } from '@/lib/blog/blog-fixtures';
import { BlogHomeStrip } from './blog-home-strip';
import { pressable, screenText } from './blog-test-helpers';

const mockHome = jest.fn<Promise<BlogHomeFeedResponse>, []>();
const mockSetSection = jest.fn<Promise<void>, [string, boolean]>(async () => undefined);
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
jest.mock('@/lib/home/home-sections-store', () => ({
  __esModule: true,
  homeSectionsStore: { set: (key: string, shown: boolean) => mockSetSection(key, shown) },
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

  it('«Скрыть» снимает галочку «Блог-лента» в «Настройках» — отдельного флага у полосы нет', async () => {
    mockHome.mockResolvedValue({ posts: [blogPost('a')], total: 1 });
    const renderer = await render();
    await act(async () => pressable(renderer, 'Скрыть').props.onPress());
    expect(mockSetSection).toHaveBeenCalledWith('blog', false);
    expect(pressable(renderer, 'Скрыть').props.accessibilityHint).toContain('«Настройках»');
  });

  it('сервис упал — полоса молча уходит, переписке она не мешает', async () => {
    mockHome.mockRejectedValue(new Error('502'));
    const renderer = await render();
    expect(renderer.toJSON()).toBeNull();
  });

  it('свежих постов нет — приглашение написать, а архив всё равно доступен', async () => {
    // Живая проверка: текущая лента пуста (срок вышел), а в архиве пост есть.
    mockHome.mockResolvedValue({ posts: [], total: 0 });
    const renderer = await render();
    expect(screenText(renderer)).toContain('Свежих постов сейчас нет');
    expect(screenText(renderer)).not.toContain('пусто');
    act(() => pressable(renderer, 'Вся лента и прошлые посты').props.onPress());
    expect(mockOpenFeed).toHaveBeenCalled();
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
