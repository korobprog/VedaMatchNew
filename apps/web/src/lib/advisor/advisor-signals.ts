/**
 * Превращение сырых ответов сервисов во вход советника.
 *
 * Слой отдельный и чистый, потому что у него своя работа: не решать, что
 * показать, а привести восемь разных форм к одной. Порогов здесь нет —
 * «пора ли говорить про срок» решает `advisor-cards.ts`, а этот файл только
 * находит ближайшее по сроку объявление и дольше всех молчащий отклик.
 *
 * Всё на входе может быть `null`: каждый запрос на главной обёрнут в
 * `.catch(() => null)`, и упавший сервис обязан убрать одну карточку, а не
 * весь советник.
 */
import type {
  AstroStateDto,
  AstroTodayDto,
  MyCommunitiesResponse,
  MyNoticeResponsesResponse,
  NoticeDto,
  NoticeFeedResponse,
  UnionConnectionCounts,
  UnionProfileState,
} from "@vedamatch/shared";
import type { AdvisorInput } from "./advisor-cards";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Календарная разница в днях, округлённая вверх. */
function daysUntil(iso: string, now: Date): number {
  return Math.ceil((Date.parse(iso) - now.getTime()) / DAY_MS);
}

function daysSince(iso: string, now: Date): number {
  return Math.floor((now.getTime() - Date.parse(iso)) / DAY_MS);
}

/** Заголовок объявления: русский, английский или заглушка. */
function noticeTitle(notice: NoticeDto): string {
  return notice.titleRu?.trim() || notice.titleEn?.trim() || "Без заголовка";
}

/**
 * Ближайшее к концу срока объявление среди тех, с которыми ещё можно
 * что-то сделать.
 *
 * `resolved` и `hidden_by_author` намеренно пропускаются: человек уже
 * закрыл вопрос или спрятал объявление сам, и напоминать ему про срок —
 * значит спорить с его решением.
 */
export function nearestExpiring(
  feed: NoticeFeedResponse | null,
  now: Date,
): { title: string; daysLeft: number } | null {
  const candidates = (feed?.items ?? []).filter(
    (notice) =>
      notice.status === "published" ||
      (notice.status === "expired" && notice.canRenew),
  );
  if (!candidates.length) return null;

  let best = candidates[0];
  for (const notice of candidates) {
    if (Date.parse(notice.expiresAt) < Date.parse(best.expiresAt)) best = notice;
  }
  return { title: noticeTitle(best), daysLeft: daysUntil(best.expiresAt, now) };
}

/**
 * Мой отклик, который дольше всех висит без ответа.
 *
 * Ждёт ответа статус `open`. `withdrawn` — я забрал отклик сам, и молчание
 * автора меня уже не касается.
 */
export function longestSilentResponse(
  responses: MyNoticeResponsesResponse | null,
  now: Date,
): { noticeTitle: string; daysWaiting: number } | null {
  const pending = (responses?.items ?? []).filter(
    (item) => item.status === "open",
  );
  if (!pending.length) return null;

  let best = pending[0];
  for (const item of pending) {
    if (Date.parse(item.createdAt) < Date.parse(best.createdAt)) best = item;
  }
  return {
    noticeTitle: best.noticeTitle,
    daysWaiting: daysSince(best.createdAt, now),
  };
}

export interface AdvisorSources {
  hasHomeLocation: boolean;
  needsLineage: boolean;
  unionProfile: UnionProfileState | null;
  unionCounts: UnionConnectionCounts | null;
  astroState: AstroStateDto | null;
  astroToday: AstroTodayDto | null;
  myNotices: NoticeFeedResponse | null;
  myResponses: MyNoticeResponsesResponse | null;
  myCommunities: MyCommunitiesResponse | null;
}

export function toAdvisorInput(
  sources: AdvisorSources,
  now: Date,
): AdvisorInput {
  return {
    hasHomeLocation: sources.hasHomeLocation,
    needsLineage: sources.needsLineage,

    unionProfilePercent: sources.unionProfile?.completeness.percent ?? null,
    unionIncomingLikes: sources.unionCounts?.incomingPending ?? 0,

    astroPercent: sources.astroState?.completeness.percent ?? null,
    astroTodayText: sources.astroToday?.text ?? null,

    expiringNotice: nearestExpiring(sources.myNotices, now),
    // Страница ограничена полусотней, поэтому «ни одного» — единственный
    // вывод, который отсюда можно делать честно. Ради него сигнал и нужен:
    // он кормит приглашение попробовать доску.
    myNoticesTotal: sources.myNotices ? sources.myNotices.items.length : null,
    silentResponse: longestSilentResponse(sources.myResponses, now),

    communityCount: sources.myCommunities
      ? sources.myCommunities.memberships.length
      : null,
  };
}
