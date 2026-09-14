/**
 * Две кнопки запуска над списком записей (VED-33).
 *
 * Просили ровно это: одна кнопка — случайный порядок, вторая
 * многофункциональная: «первое нажатие играть один трек, второе — играть всю
 * очередь треков в папке и на последнем треке остановиться».
 *
 * Логика вынесена сюда, потому что «какое нажатие какое по счёту» — это не
 * состояние кнопки, а вопрос к плееру: человек мог уйти на другой экран,
 * поставить паузу, включить что-то ещё. Держать счётчик внутри кнопки значит
 * врать при первом же возврате на экран.
 */

/** Что произойдёт по следующему нажатию. */
export type MusicPlayStep = 'single' | 'all';

/**
 * Одна запись играет сама по себе, если очередь плеера ровно из неё и состоит:
 * тогда следующее нажатие раскрывает список целиком. Во всех остальных
 * случаях — включая «играет что-то другое» и «ничего не играет» — нажатие
 * начинает с одной записи.
 */
export function nextPlayStep({
  firstTrackId,
  queue,
  currentId,
}: {
  firstTrackId: string;
  queue: readonly string[];
  currentId: string | null;
}): MusicPlayStep {
  const aloneNow =
    currentId === firstTrackId &&
    queue.length === 1 &&
    queue[0] === firstTrackId;
  return aloneNow ? 'all' : 'single';
}

/**
 * Подпись говорит про то, что случится, а не про то, что звучит: кнопка,
 * подписанная «Один трек» во время игры этого трека, читается как отметка
 * состояния, и по ней перестают нажимать.
 */
export function playStepLabel(step: MusicPlayStep): string {
  return step === 'single' ? 'Слушать один трек' : 'Слушать всё до конца';
}

/**
 * Режим проигрывания на самом плеере (VED-132). Заменил прежний «Повтор»:
 * просили три режима, и зацикливание в них не входит.
 *
 * - `track` — дослушать запись и остановиться;
 * - `folder` — играть очередь (альбом, плейлист) и остановиться в конце;
 * - `continue` — когда очередь кончилась, перейти к следующему альбому
 *   того же исполнителя.
 */
export type MusicPlaybackMode = 'track' | 'folder' | 'continue';

export const PLAYBACK_MODES: readonly MusicPlaybackMode[] = [
  'track',
  'folder',
  'continue',
];

/** По умолчанию — как вёл себя плеер до режимов: очередь до конца. */
export const DEFAULT_PLAYBACK_MODE: MusicPlaybackMode = 'folder';

/** Одна кнопка перебирает режимы по кругу. */
export function nextPlaybackMode(mode: MusicPlaybackMode): MusicPlaybackMode {
  return PLAYBACK_MODES[(PLAYBACK_MODES.indexOf(mode) + 1) % PLAYBACK_MODES.length];
}

/** Имя кнопки: значок без подписи, поэтому режим называет она. */
export function playbackModeLabel(mode: MusicPlaybackMode): string {
  switch (mode) {
    case 'track':
      return 'Режим: одна запись и стоп';
    case 'folder':
      return 'Режим: альбом до конца и стоп';
    case 'continue':
      return 'Режим: дальше — следующий альбом или исполнитель';
  }
}

export function isPlaybackMode(value: unknown): value is MusicPlaybackMode {
  return PLAYBACK_MODES.includes(value as MusicPlaybackMode);
}

/**
 * Что делать, когда запись кончилась.
 *
 * `stop` — тишина; `next` — следующая запись очереди; `nextAlbum` — очередь
 * кончилась, идём за следующим альбомом исполнителя.
 */
export function endOfTrackAction({
  mode,
  hasNext,
}: {
  mode: MusicPlaybackMode;
  hasNext: boolean;
}): 'stop' | 'next' | 'nextAlbum' {
  if (mode === 'track') return 'stop';
  if (hasNext) return 'next';
  return mode === 'continue' ? 'nextAlbum' : 'stop';
}

/**
 * Следующий альбом исполнителя после того, где лежит дослушанная запись.
 *
 * Порядок — как на странице исполнителя (свежие сверху): «следующий» — тот,
 * что стоит ниже. `null` — альбомом дальше идти некуда, и режим «дальше»
 * переходит к следующему исполнителю (`nextArtistSlug`):
 * - последний альбом — по кругу не идём, режим «дальше», а не «повтор»;
 * - запись без альбома — её «папка» и есть исполнитель: начать с его же
 *   первого альбома значило бы сыграть те же записи второй раз;
 * - альбома нет в списке исполнителя (сборник другого автора) — угадывать,
 *   что считать «следующим», здесь не из чего.
 */
export function nextAlbumSlug(
  albums: readonly { slug: string }[],
  currentAlbumSlug: string | null,
): string | null {
  if (!currentAlbumSlug) return null;
  const at = albums.findIndex((album) => album.slug === currentAlbumSlug);
  if (at === -1 || at === albums.length - 1) return null;
  return albums[at + 1].slug;
}

/**
 * Следующий исполнитель Медиатеки — когда альбомом дальше идти некуда.
 *
 * На проде альбомов нет вовсе: записи лежат у исполнителей, и «папка» в
 * Медиатеке — это карточка исполнителя. Порядок — как в списке исполнителей
 * Медиатеки. После последнего — тишина, по кругу не идём.
 */
export function nextArtistSlug(
  artists: readonly { slug: string }[],
  currentArtistSlug: string,
): string | null {
  const at = artists.findIndex((artist) => artist.slug === currentArtistSlug);
  if (at === -1 || at === artists.length - 1) return null;
  return artists[at + 1].slug;
}

/**
 * Какую запись включить в случайном порядке. Бросок отделён, чтобы тест не
 * зависел от удачи.
 */
export function randomTrackId(
  queue: readonly string[],
  roll: () => number = Math.random,
): string | null {
  if (queue.length === 0) return null;
  const at = Math.min(queue.length - 1, Math.floor(roll() * queue.length));
  return queue[at];
}
