import { applyPlaybackRate, type RateAdjustablePlayer } from './voice-player-rate';

/**
 * Мок повторяет реальный `expo-audio` на Android: `playbackRate` — только
 * геттер, попытка присвоить бросает `TypeError`, как в нативном модуле
 * (см. обоснование в `voice-player-rate.ts`). Тест ловит именно регресс
 * «кто-то вернул `player.playbackRate = rate`» — с ним `applyPlaybackRate`
 * должна была бы бросать точно так же.
 */
function createNativeLikePlayer() {
  const setPlaybackRate = jest.fn();
  const player = { setPlaybackRate } as RateAdjustablePlayer;
  Object.defineProperty(player, 'playbackRate', {
    get: () => 1,
    set: () => {
      throw new TypeError("Cannot assign to property 'playbackRate' which has only a getter");
    },
  });
  return { player: player as RateAdjustablePlayer & { playbackRate: number }, setPlaybackRate };
}

describe('applyPlaybackRate', () => {
  it('меняет скорость через setPlaybackRate — не бросает на плеере с геттером-без-сеттера', () => {
    const { player, setPlaybackRate } = createNativeLikePlayer();
    expect(() => applyPlaybackRate(player, 1.5)).not.toThrow();
    expect(setPlaybackRate).toHaveBeenCalledWith(1.5);
    expect(setPlaybackRate).toHaveBeenCalledTimes(1);
  });

  it('контроль: прямое присваивание в такой же мок действительно бросает — тест ловит регресс', () => {
    const { player } = createNativeLikePlayer();
    expect(() => {
      player.playbackRate = 2;
    }).toThrow(TypeError);
  });
});
