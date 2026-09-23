import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { RetryButton } from '@/components/retry-button';
import { byLabel, fakePlayer, mediaTrack, screenText } from '@/components/media/media-test-helpers';
import { MediaPlayerContext, type MediaPlayerApi } from '@/lib/media/media-player-context';
import MediaPlayerScreen from './player';

const mockBack = jest.fn();
const mockReplace = jest.fn();
const mockSeekBar = jest.fn();

jest.mock('expo-router', () => ({
  __esModule: true,
  router: {
    back: (...args: unknown[]) => mockBack(...args),
    replace: (...args: unknown[]) => mockReplace(...args),
    canGoBack: () => true,
  },
}));
jest.mock('expo-image', () => ({ __esModule: true, Image: () => null }));
jest.mock('react-native-safe-area-context', () => ({
  __esModule: true,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
// Шкала — жесты и поток интерфейса; её арифметика проверена отдельно
// (`playback-math.spec.ts`), здесь — что экран отдаёт ей и что берёт.
jest.mock('@/components/media/seek-bar', () => ({
  __esModule: true,
  SeekBar: (props: unknown) => {
    mockSeekBar(props);
    return null;
  },
}));
jest.mock('@/theme/theme', () => ({
  __esModule: true,
  useTheme: () => ({ colors: jest.requireActual('@/theme/tokens').light }),
}));

const mounted: ReactTestRenderer[] = [];

async function render(player: MediaPlayerApi | null): Promise<ReactTestRenderer> {
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(
      <MediaPlayerContext.Provider value={player}>
        <MediaPlayerScreen />
      </MediaPlayerContext.Provider>,
    );
  });
  mounted.push(renderer);
  return renderer;
}

const track = mediaTrack('a', { title: 'Бхагавад-гита 2.13', artist: 'Лектор', album: 'Курс' });
const playing = { queue: [track], index: 0, status: 'playing' as const, positionSec: 75, durationSec: 600 };

afterEach(() => {
  jest.clearAllMocks();
  for (const renderer of mounted.splice(0)) act(() => renderer.unmount());
});

describe('полноэкранный плеер', () => {
  it('ничего не играет — объяснение и дорога в Медиатеку', async () => {
    const renderer = await render(fakePlayer());
    expect(screenText(renderer)).toContain('Сейчас ничего не играет');
    await act(async () => renderer.root.findByType(RetryButton).props.onPress());
    expect(mockReplace).toHaveBeenCalledWith('/music');
  });

  it('название, исполнитель, время и шкала', async () => {
    const player = fakePlayer(playing);
    const renderer = await render(player);
    const text = screenText(renderer);
    expect(text).toContain('Бхагавад-гита 2.13');
    expect(text).toContain('Лектор · Курс');
    expect(text).toContain('1:15');
    expect(text).toContain('10:00');
    expect(mockSeekBar).toHaveBeenLastCalledWith(
      expect.objectContaining({ positionSec: 75, durationSec: 600, disabled: false, onSeek: player.seekTo }),
    );
  });

  it('пауза и ±10 секунд', async () => {
    const player = fakePlayer(playing);
    const renderer = await render(player);
    await act(async () => byLabel(renderer, 'Пауза').props.onPress());
    expect(player.pause).toHaveBeenCalled();
    await act(async () => byLabel(renderer, 'Назад на 10 секунд').props.onPress());
    expect(player.skip).toHaveBeenCalledWith(-10);
    await act(async () => byLabel(renderer, 'Вперёд на 10 секунд').props.onPress());
    expect(player.skip).toHaveBeenCalledWith(10);
  });

  it('на паузе главная кнопка — «Играть»', async () => {
    const player = fakePlayer({ ...playing, status: 'paused' });
    const renderer = await render(player);
    await act(async () => byLabel(renderer, 'Играть').props.onPress());
    expect(player.play).toHaveBeenCalled();
  });

  it('одна запись в очереди — кнопок «предыдущая/следующая» нет', async () => {
    const renderer = await render(fakePlayer(playing));
    expect(() => byLabel(renderer, 'Следующая запись')).toThrow();
    expect(() => byLabel(renderer, 'Предыдущая запись')).toThrow();
  });

  it('в очереди больше одной — есть и работают (задел этапа 2)', async () => {
    const player = fakePlayer({ ...playing, queue: [mediaTrack('z'), track, mediaTrack('b')], index: 1 });
    const renderer = await render(player);
    await act(async () => byLabel(renderer, 'Следующая запись').props.onPress());
    expect(player.next).toHaveBeenCalled();
    await act(async () => byLabel(renderer, 'Предыдущая запись').props.onPress());
    expect(player.previous).toHaveBeenCalled();
  });

  it('загрузка — шкала и перемотка недоступны, слово состояния', async () => {
    const renderer = await render(fakePlayer({ ...playing, status: 'loading' }));
    expect(screenText(renderer)).toContain('Загружаем запись…');
    expect(mockSeekBar).toHaveBeenLastCalledWith(expect.objectContaining({ disabled: true }));
    expect(byLabel(renderer, 'Назад на 10 секунд').props.disabled).toBe(true);
  });

  it('ошибка — текст и «Повторить»', async () => {
    const player = fakePlayer({ ...playing, status: 'error', error: 'Нет связи с сервером.' });
    const renderer = await render(player);
    expect(screenText(renderer)).toContain('Нет связи с сервером.');
    await act(async () => renderer.root.findByType(RetryButton).props.onPress());
    expect(player.play).toHaveBeenCalled();
  });

  it('звонок — объясняет, что запись продолжится после него', async () => {
    const renderer = await render(fakePlayer({ ...playing, status: 'paused' }, { callBusy: true }));
    expect(screenText(renderer)).toContain('Идёт звонок — запись продолжится, когда он закончится.');
  });

  it('«Свернуть» не останавливает звук, «Остановить и закрыть» — останавливает', async () => {
    const player = fakePlayer(playing);
    const renderer = await render(player);
    await act(async () => byLabel(renderer, 'Свернуть плеер').props.onPress());
    expect(mockBack).toHaveBeenCalled();
    expect(player.stop).not.toHaveBeenCalled();
    const stop = renderer.root.findAll(
      (node) => typeof node.props?.onPress === 'function' && node.props?.accessibilityHint === 'Останавливает звук и убирает плеер из шторки',
    )[0];
    await act(async () => stop.props.onPress());
    expect(player.stop).toHaveBeenCalled();
  });
});
