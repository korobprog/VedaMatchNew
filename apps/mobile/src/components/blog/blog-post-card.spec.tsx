import type { BlogPostDto } from '@vedamatch/shared';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { blogPost } from '@/lib/blog/blog-fixtures';
import { BlogPostCard, type BlogPostCardProps } from './blog-post-card';
import { pressable, pressables, screenText } from './blog-test-helpers';

jest.mock('@/theme/theme', () => ({
  __esModule: true,
  useTheme: () => ({ colors: jest.requireActual('@/theme/tokens').light }),
}));

const now = new Date(2026, 8, 23, 12, 0);
const longText = ['Первая строка', 'Вторая строка', 'Третья строка', 'Четвёртая — под «Далее»'].join('\n');

function render(post: BlogPostDto, overrides: Partial<BlogPostCardProps> = {}) {
  const props: BlogPostCardProps = {
    post,
    now,
    variant: 'feed',
    onOpenPost: jest.fn(),
    onOpenAuthor: jest.fn(),
    onRepost: jest.fn(async () => undefined),
    onCopy: jest.fn(async () => undefined),
    onDelete: jest.fn(),
    ...overrides,
  };
  let renderer!: ReactTestRenderer;
  act(() => {
    renderer = create(<BlogPostCard {...props} />);
  });
  return { renderer, props };
}

describe('карточка поста в ленте', () => {
  it('показывает заголовок и тихую строку с отображаемым именем автора', () => {
    const { renderer } = render(blogPost('p1', { title: 'Киртан', author: { id: 'u', name: 'Шьям дас', avatarUrl: null } }));
    const text = screenText(renderer);
    expect(text).toContain('Киртан');
    expect(text).toContain('Шьям дас · 21 сентября, 09:05');
  });

  it('шапки с автором над картинкой в ленте нет — она в полном развороте', () => {
    const { renderer } = render(blogPost('p1'));
    expect(pressables(renderer, 'Открыть блог автора')).toHaveLength(0);
  });

  it('нажатие на заголовок открывает этот пост', () => {
    const { renderer, props } = render(blogPost('p1', { title: 'Киртан' }));
    act(() => pressable(renderer, 'Открыть пост: Киртан').props.onPress());
    expect(props.onOpenPost).toHaveBeenCalledWith('p1');
  });

  it('нажатие на картинку тоже открывает этот пост', () => {
    const post = blogPost('p2', {
      title: 'Фото',
      images: [{ id: 'i', url: 'https://cdn/i.jpg', width: 800, height: 800 }],
    });
    const { renderer, props } = render(post);
    const opens = pressables(renderer, 'Открыть пост: Фото');
    expect(opens.length).toBe(2);
    act(() => opens[0].props.onPress());
    expect(props.onOpenPost).toHaveBeenCalledWith('p2');
  });

  it('«Далее» есть только у длинного текста и разворачивает его на месте', () => {
    const { renderer } = render(blogPost('p1', { text: longText }));
    expect(screenText(renderer)).not.toContain('Четвёртая');
    act(() => pressable(renderer, 'Далее').props.onPress());
    expect(screenText(renderer)).toContain('Четвёртая — под «Далее»');
    expect(screenText(renderer)).toContain('Свернуть');

    const short = render(blogPost('p2', { text: 'Коротко' }));
    expect(pressables(short.renderer, 'Далее')).toHaveLength(0);
  });

  it('«Удалить» — только у своего поста', () => {
    expect(pressables(render(blogPost('p1', { canManage: false })).renderer, 'Удалить')).toHaveLength(0);
    const own = render(blogPost('p1', { canManage: true }));
    act(() => pressable(own.renderer, 'Удалить').props.onPress());
    expect(own.props.onDelete).toHaveBeenCalled();
  });

  it('копирование отвечает «Скопировано»', async () => {
    const { renderer, props } = render(blogPost('p1'));
    await act(async () => pressable(renderer, 'Копировать').props.onPress());
    expect(props.onCopy).toHaveBeenCalled();
    expect(screenText(renderer)).toContain('Скопировано');
  });

  it('репост не удался — ошибка словами рядом с кнопками, кнопка снова доступна', async () => {
    const onRepost = jest.fn(async () => {
      throw new Error('На сегодня постов достаточно — продолжите завтра.');
    });
    const { renderer } = render(blogPost('p1'), { onRepost });
    await act(async () => pressable(renderer, /^Репост/).props.onPress());
    expect(screenText(renderer)).toContain('На сегодня постов достаточно');
    expect(pressable(renderer, /^Репост/).props.accessibilityState).toEqual({ busy: false, disabled: false });
  });

  it('у репоста крупно — оригинал, сверху — кто поделился', () => {
    const post = blogPost('r1', {
      title: null,
      text: '',
      repostOf: {
        id: 's1',
        author: { id: 'u2', name: 'Радха деви даси', avatarUrl: null },
        title: 'Оригинал',
        text: 'Слова оригинала',
        images: [],
        createdAt: new Date(2026, 8, 20, 8, 0).toISOString(),
      },
    });
    const text = screenText(render(post).renderer);
    expect(text).toContain('Репост · Маму Тхакур дас');
    expect(text).toContain('Оригинал');
    expect(text).toContain('Радха деви даси · 20 сентября, 08:00');
  });
});

describe('пост целиком', () => {
  it('шапка с автором ведёт в его блог, текст — целиком, без «Далее»', () => {
    const { renderer, props } = render(blogPost('p1', { text: longText }), { variant: 'full' });
    expect(screenText(renderer)).toContain('Четвёртая — под «Далее»');
    expect(pressables(renderer, /^Далее$/)).toHaveLength(0);
    act(() => pressable(renderer, 'Открыть блог автора').props.onPress());
    expect(props.onOpenAuthor).toHaveBeenCalledWith('u-1');
  });
});
