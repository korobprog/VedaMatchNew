/**
 * Попросить полосу плеера показаться свёрнутой (VED-416).
 *
 * Свёрнута полоса или развёрнута — состояние самой полосы (`MiniPlayer`),
 * провайдер плеера о нём не знает. Горячей кнопке «Плеер» из шапки нужно
 * выкатить полосу свёрнутой, а тянуть ради этого состояние в провайдер —
 * значит перерисовывать портал на каждый тик. Поэтому событием на `window`:
 * полоса слушает его и сворачивается, как если бы нажали её собственную
 * кнопку «Свернуть» (с запоминанием).
 *
 * Звук этим событием не трогается: играть или нет, решает тот, кто
 * просит, через `useMusicPlayer()`.
 */
export const MUSIC_PLAYER_REVEAL_EVENT = "vedamatch:music-player-reveal";

export function revealMusicPlayerCollapsed(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(MUSIC_PLAYER_REVEAL_EVENT));
}
