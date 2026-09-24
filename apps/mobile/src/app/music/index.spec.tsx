import { FlatList } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { ApiError } from '@/lib/api/client';
import { RetryButton } from '@/components/retry-button';
import { byLabel, fakePlayer, mediaTrack, screenText } from '@/components/media/media-test-helpers';
import type { MediaAudiobook, MediaCatalog, MediaTrackPage } from '@/lib/media/media-parse';
import { MediaPlayerContext, type MediaPlayerApi } from '@/lib/media/media-player-context';
import type { MediaFilter } from '@/lib/media/media-query';
import MediaLibraryScreen from './index';

const mockTracks = jest.fn<Promise<MediaTrackPage>, [MediaFilter, string | null]>();
const mockCatalog = jest.fn<Promise<MediaCatalog>, [string | null]>();
const mockBooks = jest.fn<Promise<MediaAudiobook[]>, []>();
const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  __esModule: true,
  router: { push: (...args: unknown[]) => mockPush(...args) },
  Stack: { Screen: () => null },
}));
jest.mock('expo-image', () => ({ __esModule: true, Image: () => null }));
jest.mock('react-native-safe-area-context', () => ({
  __esModule: true,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('@/components/keyboard-controller-web', () => {
  const { View } = jest.requireActual('react-native');
  return { __esModule: true, ChatKeyboardAvoidingView: View };
});
jest.mock('react-native-reanimated', () => {
  const { View } = jest.requireActual('react-native');
  const chain = (): unknown => new Proxy({}, { get: () => chain });
  return { __esModule: true, default: { View }, FadeIn: chain(), FadeOut: chain(), Easing: { bezier: () => (t: number) => t }, ReduceMotion: { System: 'system' } };
});
jest.mock('@/theme/theme', () => ({
  __esModule: true,
  useTheme: () => ({ colors: jest.requireActual('@/theme/tokens').light }),
}));
// Клиент сессии в приложении один на процесс — и в тесте тот же объект.
const mockSession = { api: {} };
jest.mock('@/lib/auth/session', () => ({ __esModule: true, useSession: () => mockSession }));
jest.mock('@/lib/media/media-api', () => ({
  __esModule: true,
  createMediaApi: () => ({
    tracks: (filter: MediaFilter, cursor: string | null) => mockTracks(filter, cursor),
    catalog: (root: string | null) => mockCatalog(root),
    audiobooks: () => mockBooks(),
  }),
}));

const catalog: MediaCatalog = {
  totalTracks: 3,
  categories: [
    { id: 'r1', slug: 'traditional', title: 'Традиционное', kind: 'root', position: 0, trackCount: 2 },
    { id: 's1', slug: 'kirtan', title: 'Киртан', kind: 'style', position: 1, trackCount: 2 },
  ],
};
const book: MediaAudiobook = { id: 'b1', slug: 'gita', title: 'Бхагавад-гита', author: 'Вьясадева', reader: null, coverUrl: null, chapterCount: 18 };

const mounted: ReactTestRenderer[] = [];

async function render(player: MediaPlayerApi | null = fakePlayer()): Promise<ReactTestRenderer> {
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(
      <MediaPlayerContext.Provider value={player}>
        <MediaLibraryScreen />
      </MediaPlayerContext.Provider>,
    );
  });
  mounted.push(renderer);
  return renderer;
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.useRealTimers();
  mockCatalog.mockResolvedValue(catalog);
  mockBooks.mockResolvedValue([book]);
  mockTracks.mockResolvedValue({ items: [mediaTrack('a', { title: 'Шри Гуруваштака' })], nextCursor: null });
});
afterEach(() => {
  for (const renderer of mounted.splice(0)) act(() => renderer.unmount());
});

describe('экран Медиатеки', () => {
  it('разделы как на сайте и записи по алфавиту', async () => {
    const renderer = await render();
    expect(mockTracks).toHaveBeenCalledWith({ root: null, category: null, query: '', sort: 'title' }, null);
    const text = screenText(renderer);
    for (const label of ['Всё', 'Традиционное', 'Аудиокниги', 'Все стили', 'Киртан', 'По алфавиту', 'Новое', 'Популярное']) {
      expect(text).toContain(label);
    }
    expect(text).toContain('Шри Гуруваштака');
    expect(text).toContain('Это все записи.');
  });

  it('пока первая порция не пришла — скелет, а не «пусто»', async () => {
    mockTracks.mockReturnValue(new Promise(() => undefined));
    const renderer = await render();
    expect(screenText(renderer)).not.toContain('пока нет записей');
    expect(renderer.root.findAll((node) => node.props?.accessibilityLabel === 'Загружаем записи').length).toBeGreaterThan(0);
  });

  it('ошибка первой загрузки — объяснение и «Повторить», который загружает снова', async () => {
    mockTracks.mockRejectedValueOnce(new ApiError(503, 'Хранилище недоступно', null));
    const renderer = await render();
    expect(screenText(renderer)).toContain('Хранилище записей сейчас недоступно');
    await act(async () => renderer.root.findByType(RetryButton).props.onPress());
    expect(mockTracks).toHaveBeenCalledTimes(2);
    expect(screenText(renderer)).toContain('Шри Гуруваштака');
  });

  it('нажатие на запись включает её очередью из одной', async () => {
    const player = fakePlayer();
    const renderer = await render(player);
    await act(async () => byLabel(renderer, /^Шри Гуруваштака/).props.onPress());
    expect(player.playQueue).toHaveBeenCalledWith([expect.objectContaining({ id: 'a' })], 0);
  });

  it('своя запись в списке помечена «Играет»', async () => {
    const track = mediaTrack('a', { title: 'Шри Гуруваштака' });
    const renderer = await render(fakePlayer({ queue: [track], index: 0, status: 'playing' }));
    expect(screenText(renderer)).toContain('Играет');
  });

  it('вкладка и стиль уходят в запрос, смена вкладки сбрасывает стиль', async () => {
    const renderer = await render();
    await act(async () => byLabel(renderer, 'Киртан, 2').props.onPress());
    expect(mockTracks).toHaveBeenLastCalledWith(expect.objectContaining({ category: 'kirtan' }), null);
    await act(async () => byLabel(renderer, 'Традиционное, 2').props.onPress());
    expect(mockTracks).toHaveBeenLastCalledWith(expect.objectContaining({ root: 'traditional', category: null }), null);
    expect(mockCatalog).toHaveBeenLastCalledWith('traditional');
  });

  it('порядок уходит в запрос', async () => {
    const renderer = await render();
    await act(async () => byLabel(renderer, 'Популярное').props.onPress());
    expect(mockTracks).toHaveBeenLastCalledWith(expect.objectContaining({ sort: 'popular' }), null);
  });

  it('поиск — после паузы набора, пусто — объяснение и сброс', async () => {
    jest.useFakeTimers();
    const renderer = await render();
    mockTracks.mockResolvedValue({ items: [], nextCursor: null });
    const input = renderer.root.findByProps({ accessibilityLabel: 'Поиск по Медиатеке' });
    await act(async () => input.props.onChangeText('рамаяна'));
    expect(mockTracks).toHaveBeenCalledTimes(1);
    await act(async () => {
      jest.advanceTimersByTime(400);
    });
    expect(mockTracks).toHaveBeenLastCalledWith(expect.objectContaining({ query: 'рамаяна' }), null);
    expect(screenText(renderer)).toContain('По запросу «рамаяна» ничего не нашлось.');
    await act(async () => byLabel(renderer, 'Очистить поиск').props.onPress());
    await act(async () => {
      jest.advanceTimersByTime(400);
    });
    expect(mockTracks).toHaveBeenLastCalledWith(expect.objectContaining({ query: '' }), null);
    jest.useRealTimers();
  });

  it('следующая порция — по курсору, дописывается в конец', async () => {
    mockTracks
      .mockResolvedValueOnce({ items: [mediaTrack('a')], nextCursor: 'a' })
      .mockResolvedValueOnce({ items: [mediaTrack('b')], nextCursor: null });
    const renderer = await render();
    await act(async () => renderer.root.findByType(FlatList).props.onEndReached());
    expect(mockTracks).toHaveBeenLastCalledWith(expect.anything(), 'a');
    expect(screenText(renderer)).toContain('Запись b');
  });

  it('«Аудиокниги» — список книг, книга открывает свой экран', async () => {
    const renderer = await render();
    await act(async () => byLabel(renderer, 'Аудиокниги').props.onPress());
    expect(screenText(renderer)).toContain('Бхагавад-гита');
    expect(screenText(renderer)).not.toContain('Все стили');
    await act(async () => byLabel(renderer, /^Бхагавад-гита/).props.onPress());
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/music/audiobooks/[slug]', params: { slug: 'gita' } });
  });

  it('без книг вкладки «Аудиокниги» нет', async () => {
    mockBooks.mockResolvedValue([]);
    const renderer = await render();
    expect(screenText(renderer)).not.toContain('Аудиокниги');
  });
});
