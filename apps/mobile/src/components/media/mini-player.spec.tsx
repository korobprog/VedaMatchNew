import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { MediaPlayerContext, type MediaPlayerApi } from '@/lib/media/media-player-context';
import { hitTarget } from '@/theme/tokens';
import { byLabel, fakePlayer, mediaTrack, screenText } from './media-test-helpers';
import { MiniPlayer } from './mini-player';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ __esModule: true, router: { push: (...args: unknown[]) => mockPush(...args) } }));
jest.mock('expo-image', () => ({ __esModule: true, Image: () => null }));
// Штатный мок reanimated тянет нативный worklets; мини-плееру нужны вид и
// цепочка настроек проявления.
jest.mock('react-native-reanimated', () => {
  const { View } = jest.requireActual('react-native');
  const chain = (): unknown => new Proxy({}, { get: () => chain });
  return {
    __esModule: true,
    default: { View },
    FadeIn: chain(),
    FadeOut: chain(),
    Easing: { bezier: () => (t: number) => t },
    ReduceMotion: { System: 'system' },
  };
});
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
        <MiniPlayer />
      </MediaPlayerContext.Provider>,
    );
  });
  mounted.push(renderer);
  return renderer;
}

const track = mediaTrack('a', { title: 'Нама-санкиртана', artist: 'Хор храма' });

afterEach(() => {
  jest.clearAllMocks();
  for (const renderer of mounted.splice(0)) act(() => renderer.unmount());
});

describe('мини-плеер', () => {
  it('нет плеера или ничего не выбрано — полосы нет', async () => {
    expect((await render(null)).toJSON()).toBeNull();
    expect((await render(fakePlayer())).toJSON()).toBeNull();
  });

  it('играет: название, исполнитель и «Пауза»', async () => {
    const player = fakePlayer({ queue: [track], index: 0, status: 'playing', positionSec: 60, durationSec: 240 });
    const renderer = await render(player);
    expect(screenText(renderer)).toContain('Нама-санкиртана');
    expect(screenText(renderer)).toContain('Хор храма');
    await act(async () => byLabel(renderer, 'Пауза').props.onPress());
    expect(player.pause).toHaveBeenCalled();
    expect(player.play).not.toHaveBeenCalled();
  });

  it('на паузе главная кнопка — «Играть»', async () => {
    const player = fakePlayer({ queue: [track], index: 0, status: 'paused' });
    const renderer = await render(player);
    await act(async () => byLabel(renderer, 'Играть').props.onPress());
    expect(player.play).toHaveBeenCalled();
  });

  it('ошибка — «Повторить» запускает запись снова', async () => {
    const player = fakePlayer({ queue: [track], index: 0, status: 'error', error: 'x' });
    const renderer = await render(player);
    expect(screenText(renderer)).toContain('Не удалось воспроизвести');
    await act(async () => byLabel(renderer, 'Повторить').props.onPress());
    expect(player.play).toHaveBeenCalled();
  });

  it('буферизация — кнопка занята, крутилка вместо значка', async () => {
    const renderer = await render(fakePlayer({ queue: [track], index: 0, status: 'buffering' }));
    expect(byLabel(renderer, 'Пауза').props.accessibilityState).toEqual({ busy: true });
  });

  it('звонок — объясняет паузу словами', async () => {
    const renderer = await render(fakePlayer({ queue: [track], index: 0, status: 'paused' }, { callBusy: true }));
    expect(screenText(renderer)).toContain('Пауза на время звонка');
  });

  it('нажатие на название раскрывает полноэкранный плеер', async () => {
    const renderer = await render(fakePlayer({ queue: [track], index: 0, status: 'playing' }));
    await act(async () => byLabel(renderer, /^Нама-санкиртана/).props.onPress());
    expect(mockPush).toHaveBeenCalledWith('/music/player');
  });

  it('«закрыть» останавливает плеер', async () => {
    const player = fakePlayer({ queue: [track], index: 0, status: 'playing' });
    const renderer = await render(player);
    await act(async () => byLabel(renderer, 'Остановить и закрыть плеер').props.onPress());
    expect(player.stop).toHaveBeenCalled();
  });

  it('кнопки — не меньше зоны нажатия', async () => {
    const renderer = await render(fakePlayer({ queue: [track], index: 0, status: 'playing' }));
    for (const label of ['Пауза', 'Остановить и закрыть плеер']) {
      const style = byLabel(renderer, label).props.style({ pressed: false });
      const flat = Object.assign({}, ...[style].flat(3).filter(Boolean));
      expect(flat.width).toBeGreaterThanOrEqual(hitTarget);
      expect(flat.height).toBeGreaterThanOrEqual(hitTarget);
    }
  });
});
