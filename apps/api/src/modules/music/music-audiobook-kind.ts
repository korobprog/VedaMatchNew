import {
  MUSIC_AUDIOBOOK_KINDS,
  type MusicAudiobookKind,
} from '@vedamatch/shared';

/**
 * Раздел из строки запроса (VED-437). Пусто или мусор — «Аудиокниги»:
 * до появления «Лекций» раздел был один, и старые клиенты шлют список без
 * `kind`.
 */
export function parseAudiobookKind(value: unknown): MusicAudiobookKind {
  return MUSIC_AUDIOBOOK_KINDS.find((kind) => kind === value) ?? 'audiobook';
}

/**
 * Раздел из тела правки: `undefined` — не менять, недопустимое значение —
 * `null`, и сервис откажет, а не переложит цикл молча в другой раздел.
 */
export function readAudiobookKindField(
  value: unknown,
): MusicAudiobookKind | undefined | null {
  if (value === undefined) return undefined;
  return MUSIC_AUDIOBOOK_KINDS.find((kind) => kind === value) ?? null;
}
