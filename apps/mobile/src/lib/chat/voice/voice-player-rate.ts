/** Минимальный интерфейс плеера, которым пользуется скорость воспроизведения. */
export interface RateAdjustablePlayer {
  setPlaybackRate(rate: number): void;
}

/**
 * Меняет скорость плеера голосового. Только через `setPlaybackRate()` —
 * НЕ присваиванием `player.playbackRate = rate`.
 *
 * В `expo-audio` 57 на Android `playbackRate` объявлено в `AudioPlayer.kt`
 * одним `Property("playbackRate") { player -> ... }` без `.set { … }`
 * (сравни с `Property("volume") { … }.set { … }` рядом — там сеттер есть) —
 * то есть это свойство только для чтения на уровне нативного модуля,
 * несмотря на то что типы `expo-audio` объявляют его как обычное
 * читаемо-writable поле. Присваивание бросает `TypeError: Cannot assign to
 * property 'playbackRate' which has only a getter` (строгий режим ES-модулей)
 * и роняло весь экран переписки при открытии голосового (живая проверка
 * сборки 1021, Samsung A51, feedback по VED-286). `setPlaybackRate` — уже
 * готовая `Function` с настоящей записью в `AudioModule.kt`.
 */
export function applyPlaybackRate(player: RateAdjustablePlayer, rate: number): void {
  player.setPlaybackRate(rate);
}
