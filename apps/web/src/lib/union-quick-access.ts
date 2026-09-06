import type {
  UnionChatsState,
  UnionConnectionCounts,
  UnionProfileFieldKey,
  UnionProfileState,
  UnionRecommendationsResponse,
} from "@vedamatch/shared";

const MAX_PREVIEW_AVATARS = 3;

export interface UnionQuickAccessData {
  unreadMessages: number;
  incomingLikes: number;
  previewAvatars: { url: string | null; initial: string }[];
  moreCount: number;
  profileCompletionPercent: number | null;
  /**
   * Поля анкеты и что из них заполнено — под полосой значками. Пусто, когда
   * полосы нет: у заполненной анкеты показывать нечего.
   */
  profileItems: { key: UnionProfileFieldKey; filled: boolean }[];
}

/**
 * Maps the four independent Union dashboard signals into one shape for
 * `UnionQuickAccessWidget`. Each input is nullable because every caller in
 * `page.tsx` wraps its fetch in `.catch(() => null)` — one failing/missing
 * source degrades that piece only, never the whole widget.
 */
export function buildUnionQuickAccessData(
  chats: UnionChatsState | null,
  counts: UnionConnectionCounts | null,
  profile: UnionProfileState | null,
  recommendations: UnionRecommendationsResponse | null,
): UnionQuickAccessData {
  const items = recommendations?.items ?? [];
  const total = recommendations?.total ?? 0;
  const shown = items.slice(0, MAX_PREVIEW_AVATARS);
  const percent = profile?.completeness.percent ?? null;

  return {
    unreadMessages: chats?.unreadTotal ?? 0,
    incomingLikes: counts?.incomingPending ?? 0,
    previewAvatars: shown.map((item) => ({
      url: item.user.avatarUrl,
      initial: item.user.name.charAt(0).toUpperCase(),
    })),
    moreCount: Math.max(0, total - shown.length),
    profileCompletionPercent:
      percent !== null && percent < 100 ? percent : null,
    profileItems:
      percent !== null && percent < 100
        ? (profile?.completeness.items ?? []).map(({ key, filled }) => ({
            key,
            filled,
          }))
        : [],
  };
}
