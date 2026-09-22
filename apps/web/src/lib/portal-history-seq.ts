/**
 * Направление шага по истории браузера (VED-354).
 *
 * `popstate` не говорит, нажали «назад» или «вперёд», а портал обязан это
 * различать: иначе шаг вперёд разбирался бы как шаг назад и кнопка «вперёд»
 * ходила бы кругами. Различаем по собственному номеру, который портал
 * дописывает в `history.state` каждой своей записи: у записи, лежащей в
 * истории раньше, номер меньше.
 *
 * Номер дописывается рядом с состоянием роутера (`{...state, vmSeq}`), а не
 * вместо него: в `history.state` живёт дерево Next, и затереть его значит
 * сломать саму навигацию.
 */

/** Ключ номера в `history.state`. */
export const PORTAL_SEQ_KEY = "vmSeq";

export type PortalHistoryDirection = -1 | 1;

/**
 * Куда шагнули. Запись без номера — из прошлой жизни вкладки (портал тогда
 * ещё не размечал историю) или чужая: считаем её шагом назад, потому что
 * «назад» — единственная кнопка, которой пользуются на телефоне, и ошибиться
 * в её пользу дешевле.
 */
export function historyStepDirection(
  entrySeq: unknown,
  currentSeq: number | null,
): PortalHistoryDirection {
  if (typeof entrySeq !== "number" || !Number.isFinite(entrySeq)) return -1;
  if (currentSeq === null) return -1;
  return entrySeq > currentSeq ? 1 : -1;
}

/** Номер записи, если портал его туда клал. */
export function historyEntrySeq(state: unknown): number | null {
  if (!state || typeof state !== "object") return null;
  const value = (state as Record<string, unknown>)[PORTAL_SEQ_KEY];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
