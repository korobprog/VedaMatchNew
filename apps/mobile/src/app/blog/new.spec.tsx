import type { BlogPostCreatedResponse } from '@vedamatch/shared';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { ApiError } from '@/lib/api/client';
import { resetBlogChanges, subscribeBlogChanges } from '@/lib/blog/blog-changes';
import type { BlogDraft } from '@/lib/blog/blog-draft';
import { blogPost } from '@/lib/blog/blog-fixtures';
import { pressable, screenText } from '@/components/blog/blog-test-helpers';
import NewBlogPostScreen from './new';

const mockCreate = jest.fn<Promise<BlogPostCreatedResponse>, [BlogDraft]>();
const mockBack = jest.fn();
const mockReplace = jest.fn();
const mockLibrary = jest.fn();

jest.mock('expo-router', () => ({
  __esModule: true,
  router: {
    back: () => mockBack(),
    canGoBack: () => true,
    replace: (...args: unknown[]) => mockReplace(...args),
    push: jest.fn(),
  },
  Stack: { Screen: () => null },
}));
jest.mock('expo-image-picker', () => ({
  __esModule: true,
  launchImageLibraryAsync: (options: unknown) => mockLibrary(options),
  launchCameraAsync: jest.fn(),
  requestCameraPermissionsAsync: jest.fn(async () => ({ granted: false })),
}));
jest.mock('react-native-safe-area-context', () => ({
  __esModule: true,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('@/components/keyboard-controller-web', () => {
  const { ScrollView } = jest.requireActual('react-native');
  return { __esModule: true, PersonKeyboardAwareScroll: ScrollView };
});
jest.mock('@/theme/theme', () => ({
  __esModule: true,
  useTheme: () => ({ colors: jest.requireActual('@/theme/tokens').light }),
}));
jest.mock('@/lib/feedback', () => ({ __esModule: true, confirmTap: jest.fn() }));
jest.mock('@/lib/auth/session', () => ({ __esModule: true, useSession: () => ({ api: {} }) }));
jest.mock('@/lib/blog/blog-api', () => ({
  __esModule: true,
  createBlogApi: () => ({ create: (draft: BlogDraft) => mockCreate(draft) }),
}));

async function render(): Promise<ReactTestRenderer> {
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(<NewBlogPostScreen />);
  });
  return renderer;
}

function typeInto(renderer: ReactTestRenderer, label: string, value: string) {
  const input = renderer.root.find((node) => node.props?.accessibilityLabel === label && typeof node.props?.onChangeText === 'function');
  act(() => input.props.onChangeText(value));
}

beforeEach(() => {
  jest.clearAllMocks();
  resetBlogChanges();
});

describe('новый пост', () => {
  it('пустой пост не отправляется — объяснение словами', async () => {
    const renderer = await render();
    await act(async () => pressable(renderer, 'Опубликовать').props.onPress());
    expect(mockCreate).not.toHaveBeenCalled();
    expect(screenText(renderer)).toContain('Напишите что-нибудь или добавьте фотографию.');
  });

  it('текст уходит на сервер, лента узнаёт о посте, экран закрывается', async () => {
    const created = blogPost('new');
    mockCreate.mockResolvedValue({ post: created, failed: [] });
    const changes = jest.fn();
    subscribeBlogChanges(changes);
    const renderer = await render();
    typeInto(renderer, 'Заголовок', 'Киртан');
    typeInto(renderer, 'Текст поста', 'Приходите в субботу');
    await act(async () => pressable(renderer, 'Опубликовать').props.onPress());
    expect(mockCreate).toHaveBeenCalledWith({ title: 'Киртан', text: 'Приходите в субботу', photos: [] });
    expect(changes).toHaveBeenCalledWith({ kind: 'created', post: created });
    expect(mockBack).toHaveBeenCalled();
  });

  it('сервер отказал — черновик остаётся целиком, ошибка словами, можно повторить', async () => {
    mockCreate.mockRejectedValueOnce(new ApiError(400, 'daily_limit_reached', null));
    const renderer = await render();
    typeInto(renderer, 'Текст поста', 'Мой длинный пост');
    await act(async () => pressable(renderer, 'Опубликовать').props.onPress());
    expect(screenText(renderer)).toContain('На сегодня постов достаточно — продолжите завтра.');
    expect(mockBack).not.toHaveBeenCalled();
    const input = renderer.root.find((node) => node.props?.accessibilityLabel === 'Текст поста' && 'value' in node.props);
    expect(input.props.value).toBe('Мой длинный пост');

    mockCreate.mockResolvedValueOnce({ post: blogPost('ok'), failed: [] });
    await act(async () => pressable(renderer, 'Опубликовать').props.onPress());
    expect(mockCreate).toHaveBeenCalledTimes(2);
    expect(mockBack).toHaveBeenCalled();
  });

  it('текст сверх предела не отправляется, счётчик говорит, сколько убрать', async () => {
    const renderer = await render();
    typeInto(renderer, 'Текст поста', 'т'.repeat(20002));
    expect(screenText(renderer)).toContain('Лишних 2 знака — столько нужно убрать.');
    await act(async () => pressable(renderer, 'Опубликовать').props.onPress());
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('фото из галереи попадают в черновик; GIF отклонён сразу, с причиной', async () => {
    mockLibrary.mockResolvedValue({
      canceled: false,
      assets: [
        { uri: 'file:///a.jpg', mimeType: 'image/jpeg', fileSize: 100 },
        { uri: 'file:///b.gif', mimeType: 'image/gif', fileSize: 100 },
      ],
    });
    const renderer = await render();
    await act(async () => pressable(renderer, 'Из галереи').props.onPress());
    expect(mockLibrary).toHaveBeenCalledWith(expect.objectContaining({ allowsMultipleSelection: true, selectionLimit: 10 }));
    const text = screenText(renderer);
    expect(text).toContain('Фотографии · 1 из 10');
    expect(text).toContain('Фотография не подошла: нужен JPEG, PNG или WebP.');

    mockCreate.mockResolvedValue({ post: blogPost('p'), failed: [] });
    await act(async () => pressable(renderer, 'Опубликовать').props.onPress());
    expect(mockCreate.mock.calls[0][0].photos.map((photo) => photo.name)).toEqual(['photo-1.jpg']);
  });

  it('часть фото не доехала — открывается сам пост с объяснением, а не молча лента', async () => {
    mockCreate.mockResolvedValue({ post: blogPost('p9'), failed: [{ name: 'photo-1.jpg', reason: 'processing_failed' }] });
    const renderer = await render();
    typeInto(renderer, 'Текст поста', 'С фото');
    await act(async () => pressable(renderer, 'Опубликовать').props.onPress());
    expect(mockReplace).toHaveBeenCalledWith({
      pathname: '/blog/post/[id]',
      params: { id: 'p9', notice: 'Пост опубликован, но 1 фотография не загрузилась: Не удалось обработать фотографию.' },
    });
    expect(mockBack).not.toHaveBeenCalled();
  });
});
