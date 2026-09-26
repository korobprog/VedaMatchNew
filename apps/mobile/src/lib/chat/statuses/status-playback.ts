import type { ChatStatusAuthorDto, ChatStatusDto, ChatStatusRing } from '@vedamatch/shared';

/**
 * Показ статусов (VED-129): сколько держать каждый, куда листать, когда
 * закрывать просмотр жестом. Перенос
 * `apps/web/src/components/chat/statuses/status-playback.ts` плюс то, что
 * на телефоне своё: полоски прогресса, свайп вниз, ролик без плеера.
 *
 * Фото и текст — пять секунд, длинному тексту — больше, чтобы успеть
 * дочитать (не дольше двенадцати). Ролик — сколько длится, но не дольше
 * минуты: он и не бывает длиннее.
 */
export function statusDurationMs(status: ChatStatusDto): number {
  if (status.media?.kind === 'video') return Math.min(60, Math.max(1, status.media.durationSec ?? 15)) * 1000;
  const extra = Math.max(0, (status.text?.length ?? 0) - 80) * 40;
  return Math.min(12_000, 5_000 + extra);
}

export interface StatusPosition {
  author: number;
  status: number;
}

/**
 * Следующий или предыдущий статус. За последним у автора — первый
 * следующего автора; за последним у последнего — конец (`null`), просмотр
 * закрывается. Назад от первого у автора — последний у предыдущего.
 */
export function stepStatus(
  authors: readonly ChatStatusAuthorDto[],
  at: StatusPosition,
  delta: 1 | -1,
): StatusPosition | null {
  const current = authors[at.author];
  if (!current) return null;
  const next = at.status + delta;
  if (next >= 0 && next < current.statuses.length) return { author: at.author, status: next };
  const author = at.author + delta;
  const target = authors[author];
  if (!target || target.statuses.length === 0) return null;
  return { author, status: delta === 1 ? 0 : target.statuses.length - 1 };
}

/** С какого статуса открывать автора: с первого непросмотренного. */
export function firstUnseen(author: ChatStatusAuthorDto): number {
  const at = author.statuses.findIndex((status) => !status.viewed);
  return at === -1 ? 0 : at;
}

/**
 * Ответ `GET chat/statuses/users/:id` приводится к «есть что смотреть или
 * нет»: без списка статусов (старый API, пустой ответ) — статусов нет, как
 * на сайте в `user-status-avatar.tsx`.
 */
export function authorWithStatuses(value: ChatStatusAuthorDto | null | undefined): ChatStatusAuthorDto | null {
  return value && Array.isArray(value.statuses) && value.statuses.length > 0 ? value : null;
}

/**
 * Кружок автора. Своему — все секции зелёные (VED-494): это живые статусы,
 * а не просмотренные чужие, и серое кольцо читалось как «погасло».
 */
export function ringOf(author: ChatStatusAuthorDto | null | undefined, own = false): ChatStatusRing | null {
  const ready = authorWithStatuses(author);
  if (!ready) return null;
  const total = ready.statuses.length;
  return { total, unseen: own ? total : Math.max(0, ready.unseen) };
}

/**
 * Заполненность полосок прогресса сверху, от 0 до 1: пройденные — целиком,
 * текущая — на долю показа, будущие — пустые.
 */
export function progressFills(count: number, current: number, progress: number): number[] {
  const share = Number.isFinite(progress) ? Math.min(1, Math.max(0, progress)) : 0;
  return Array.from({ length: Math.max(0, count) }, (_, index) =>
    index < current ? 1 : index === current ? share : 0,
  );
}

/**
 * Идёт ли у статуса таймер показа. Ролик на вебе ведёт себя сам (время и
 * конец плеера); на телефоне своего плеера пока нет (`status-video.tsx`),
 * и ролик ждёт человека — сам к следующему не уходит.
 */
export function runsOnTimer(status: ChatStatusDto): boolean {
  return status.media?.kind !== 'video';
}

/**
 * Отметить ли просмотр на сервере: только чужой, ещё не отмеченный и один
 * раз за открытие просмотра.
 */
export function shouldMarkViewed(status: ChatStatusDto, own: boolean, alreadySent: ReadonlySet<string>): boolean {
  return !own && !status.viewed && !alreadySent.has(status.id);
}

/**
 * Свайп вниз закрывает просмотр. Жест забирается у касаний, только когда
 * палец явно идёт вниз, а не вбок — иначе ломаются тапы «назад/дальше».
 */
export function capturesDismissPan(dx: number, dy: number): boolean {
  return dy > 12 && Math.abs(dy) > Math.abs(dx) * 1.5;
}

/** Отпустили — закрывать ли: протянули далеко или смахнули быстро. */
export function isDismissSwipe(dy: number, vy: number): boolean {
  return dy > 120 || (dy > 40 && vy > 0.8);
}

/**
 * Собеседники личных бесед — для одного запроса кружков на весь список.
 * Строка, а не массив: по ней эффект понимает, что состав не изменился, и
 * не перечитывает кружки на каждое новое сообщение.
 */
export function directCompanionKey(
  conversations: readonly { kind: string; companion?: { id: string } | null }[],
): string {
  const ids = new Set<string>();
  for (const conversation of conversations) {
    if (conversation.kind === 'direct' && conversation.companion?.id) ids.add(conversation.companion.id);
  }
  return [...ids].sort().join(',');
}

/** Подпись полосы для скринридера: чья, сколько новых. */
export function statusA11yLabel(name: string, unseen: number): string {
  return `Статусы: ${name}${unseen > 0 ? `, новых ${unseen}` : ''}`;
}
