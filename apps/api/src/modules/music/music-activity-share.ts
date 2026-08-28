import type { MusicNowPlayingVisibility } from '@vedamatch/shared';

/**
 * Можно ли рассказывать друзьям о музыкальном действии человека.
 *
 * Настройка одна на всё, что Музыка сообщает наружу, а не только на «слушает
 * сейчас». Человек, выключивший видимость прослушивания, не ждёт, что вместо
 * этого в ленте появится «В избранное: „…"» — для него это то же самое
 * разглашение, только другими словами.
 *
 * Строка настроек может отсутствовать: её заводят при первом изменении, а до
 * тех пор действует умолчание схемы — `friends`.
 */
export function mayShareMusicActivity(
  visibility: MusicNowPlayingVisibility | null | undefined,
): boolean {
  return (visibility ?? 'friends') !== 'nobody';
}
