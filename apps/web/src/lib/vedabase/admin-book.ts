import type {
  VedabaseAdminBook,
  VedabaseAdminBookPatch,
} from "@vedamatch/shared";

/** Что правит админ в карточке книги (VED-662). */
export type AdminBookDraft = Pick<
  VedabaseAdminBook,
  "title" | "author" | "audienceStages" | "lineages" | "blocked"
>;

export function draftOf(book: VedabaseAdminBook): AdminBookDraft {
  return {
    title: book.title,
    author: book.author,
    audienceStages: [...book.audienceStages],
    lineages: [...book.lineages],
    blocked: book.blocked,
  };
}

function sameSet(left: readonly string[], right: readonly string[]): boolean {
  return (
    left.length === right.length && left.every((item) => right.includes(item))
  );
}

/**
 * Правка для сервера — только изменённые поля; пустая — сохранять нечего.
 * Порядок в списках не считается изменением: «для кого» — множество.
 */
export function bookPatch(
  book: VedabaseAdminBook,
  draft: AdminBookDraft,
): VedabaseAdminBookPatch {
  const patch: VedabaseAdminBookPatch = {};
  const title = draft.title.trim();
  if (title !== book.title) patch.title = title;
  const author = draft.author?.trim() || null;
  if (author !== book.author) patch.author = author;
  if (!sameSet(draft.audienceStages, book.audienceStages))
    patch.audienceStages = draft.audienceStages;
  if (!sameSet(draft.lineages, book.lineages)) patch.lineages = draft.lineages;
  if (draft.blocked !== book.blocked) patch.blocked = draft.blocked;
  return patch;
}

/** Переключить значение в списке. */
export function toggleIn(list: readonly string[], item: string): string[] {
  return list.includes(item)
    ? list.filter((value) => value !== item)
    : [...list, item];
}
