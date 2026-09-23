import type { BlogPostDto } from '@vedamatch/shared';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { ApiError } from '@/lib/api/client';
import { resetBlogChanges, subscribeBlogChanges } from '@/lib/blog/blog-changes';
import { blogPost } from '@/lib/blog/blog-fixtures';
import { pressable, pressables, screenText } from '@/components/blog/blog-test-helpers';
import BlogPostScreen from './[id]';

const mockPost = jest.fn<Promise<BlogPostDto>, [string]>();
const mockRemove = jest.fn<Promise<void>, [string]>(async () => undefined);
const mockBack = jest.fn();
const mockPush = jest.fn();
let mockParams: Record<string, string> = { id: 'p1' };

jest.mock('expo-router', () => ({
  __esModule: true,
  useLocalSearchParams: () => mockParams,
  router: { back: () => mockBack(), canGoBack: () => true, push: (...args: unknown[]) => mockPush(...args) },
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
jest.mock('@/config/app-variant', () => ({ __esModule: true, appVariant: () => ({ webOrigin: 'https://vedamatch.ru' }) }));
jest.mock('expo-clipboard', () => ({ __esModule: true, setStringAsync: jest.fn(async () => true) }));
jest.mock('@/lib/auth/session', () => ({ __esModule: true, useSession: () => ({ api: {} }) }));
jest.mock('@/lib/blog/blog-api', () => ({
  __esModule: true,
  createBlogApi: () => ({ post: (id: string) => mockPost(id), remove: (id: string) => mockRemove(id), repost: jest.fn() }),
}));

async function render(): Promise<ReactTestRenderer> {
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(<BlogPostScreen />);
  });
  return renderer;
}

beforeEach(() => {
  jest.clearAllMocks();
  resetBlogChanges();
  mockParams = { id: 'p1' };
});

describe('пост целиком', () => {
  it('берёт пост по id из адреса и показывает автора отображаемым именем', async () => {
    mockPost.mockResolvedValue(blogPost('p1', { title: 'Киртан', author: { id: 'u7', name: 'Шьям дас', avatarUrl: null } }));
    const renderer = await render();
    expect(mockPost).toHaveBeenCalledWith('p1');
    expect(screenText(renderer)).toContain('Шьям дас');
    act(() => pressable(renderer, 'Шьям дас. Открыть блог автора').props.onPress());
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/blog/authors/[id]', params: { id: 'u7' } });
  });

  it('удалённый пост — «не найден» и дорога к ленте, а не «Повторить» в пустоту', async () => {
    mockPost.mockRejectedValue(new ApiError(404, 'post_not_found', null));
    const renderer = await render();
    expect(screenText(renderer)).toContain('Пост не найден');
    expect(pressables(renderer, 'Повторить')).toHaveLength(0);
    act(() => pressable(renderer, 'К ленте').props.onPress());
    expect(mockPush).toHaveBeenCalledWith('/blog');
  });

  it('пришёл с формы с недоехавшими фото — объяснение над постом', async () => {
    mockParams = { id: 'p1', notice: 'Пост опубликован, но 1 фотография не загрузилась: Файл слишком большой.' };
    mockPost.mockResolvedValue(blogPost('p1'));
    const renderer = await render();
    expect(screenText(renderer)).toContain('1 фотография не загрузилась');
  });

  it('удаление — через подтверждение; после него лента узнаёт, а экран закрывается', async () => {
    mockPost.mockResolvedValue(blogPost('p1', { canManage: true }));
    const changes = jest.fn();
    subscribeBlogChanges(changes);
    const renderer = await render();
    act(() => pressable(renderer, 'Удалить').props.onPress());
    expect(mockRemove).not.toHaveBeenCalled();
    expect(screenText(renderer)).toContain('Удалить пост?');
    const confirm = pressables(renderer, 'Удалить').at(-1)!;
    await act(async () => confirm.props.onPress());
    expect(mockRemove).toHaveBeenCalledWith('p1');
    expect(changes).toHaveBeenCalledWith({ kind: 'removed', id: 'p1' });
    expect(mockBack).toHaveBeenCalled();
  });
});
