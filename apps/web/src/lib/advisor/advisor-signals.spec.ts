import { describe, expect, it } from "vitest";
import type {
  MyNoticeResponsesResponse,
  NoticeDto,
  NoticeFeedResponse,
  NoticeResponseDto,
} from "@vedamatch/shared";
import {
  longestSilentResponse,
  nearestExpiring,
  toAdvisorInput,
  type AdvisorSources,
} from "./advisor-signals";

const NOW = new Date("2026-08-17T12:00:00.000Z");
const inDays = (n: number) =>
  new Date(NOW.getTime() + n * 24 * 60 * 60 * 1000).toISOString();

function notice(over: Partial<NoticeDto>): NoticeDto {
  return {
    titleRu: "Отдам холодильник",
    titleEn: null,
    status: "published",
    expiresAt: inDays(10),
    canRenew: false,
    ...over,
  } as NoticeDto;
}

const feed = (items: NoticeDto[]): NoticeFeedResponse => ({
  items,
  nextCursor: null,
});

describe("nearestExpiring", () => {
  it("берёт самое близкое к концу срока, а не первое в ленте", () => {
    const found = nearestExpiring(
      feed([
        notice({ titleRu: "Дальнее", expiresAt: inDays(20) }),
        notice({ titleRu: "Ближнее", expiresAt: inDays(2) }),
        notice({ titleRu: "Среднее", expiresAt: inDays(9) }),
      ]),
      NOW,
    );
    expect(found).toEqual({ title: "Ближнее", daysLeft: 2 });
  });

  it("считает протухшее отрицательными днями", () => {
    const found = nearestExpiring(
      feed([notice({ status: "expired", canRenew: true, expiresAt: inDays(-3) })]),
      NOW,
    );
    expect(found?.daysLeft).toBe(-3);
  });

  it("не трогает то, что человек закрыл или спрятал сам", () => {
    // Напоминать про срок решённого вопроса — спорить с решением человека.
    expect(
      nearestExpiring(
        feed([
          notice({ status: "resolved", expiresAt: inDays(1) }),
          notice({ status: "hidden_by_author", expiresAt: inDays(1) }),
        ]),
        NOW,
      ),
    ).toBeNull();
  });

  it("протухшее без права продления пропускает", () => {
    expect(
      nearestExpiring(
        feed([notice({ status: "expired", canRenew: false, expiresAt: inDays(-1) })]),
        NOW,
      ),
    ).toBeNull();
  });

  it("падение сервиса и пустая лента дают null", () => {
    expect(nearestExpiring(null, NOW)).toBeNull();
    expect(nearestExpiring(feed([]), NOW)).toBeNull();
  });

  it("берёт английский заголовок, когда русского нет", () => {
    const found = nearestExpiring(
      feed([notice({ titleRu: null, titleEn: "Free fridge" })]),
      NOW,
    );
    expect(found?.title).toBe("Free fridge");
  });
});

function response(over: Partial<NoticeResponseDto>): NoticeResponseDto {
  return {
    status: "open",
    noticeTitle: "Нужны руки",
    createdAt: inDays(-1),
    ...over,
  } as NoticeResponseDto;
}

const responses = (
  items: NoticeResponseDto[],
): MyNoticeResponsesResponse => ({ items, remainingToday: 5 });

describe("longestSilentResponse", () => {
  it("берёт самый давний из неотвеченных", () => {
    const found = longestSilentResponse(
      responses([
        response({ noticeTitle: "Свежий", createdAt: inDays(-1) }),
        response({ noticeTitle: "Давний", createdAt: inDays(-8) }),
      ]),
      NOW,
    );
    expect(found).toEqual({ noticeTitle: "Давний", daysWaiting: 8 });
  });

  it("отвеченные и отозванные не считает", () => {
    // `withdrawn` — я забрал отклик сам, молчание автора меня не касается.
    expect(
      longestSilentResponse(
        responses([
          response({ status: "accepted", createdAt: inDays(-9) }),
          response({ status: "declined", createdAt: inDays(-9) }),
          response({ status: "withdrawn", createdAt: inDays(-9) }),
        ]),
        NOW,
      ),
    ).toBeNull();
  });
});

describe("toAdvisorInput", () => {
  const empty: AdvisorSources = {
    hasHomeLocation: true,
    needsLineage: false,
    unionProfile: null,
    unionCounts: null,
    astroState: null,
    astroToday: null,
    myNotices: null,
    myResponses: null,
    myCommunities: null,
  };

  it("недоступный сервис даёт null, а не ноль", () => {
    // Разница смысловая: null — «не знаем», 0 — «знаем, что ничего нет».
    // Ноль включил бы карточку «община не указана» у всех, у кого упал
    // запрос списка общин.
    const input = toAdvisorInput(empty, NOW);
    expect(input.communityCount).toBeNull();
    expect(input.myNoticesTotal).toBeNull();
    expect(input.unionProfilePercent).toBeNull();
    expect(input.astroPercent).toBeNull();
  });

  it("пустой ответ сервиса даёт ноль", () => {
    const input = toAdvisorInput(
      {
        ...empty,
        myCommunities: { memberships: [], pending: [] },
        myNotices: feed([]),
      },
      NOW,
    );
    expect(input.communityCount).toBe(0);
    expect(input.myNoticesTotal).toBe(0);
  });

  it("симпатии без счётчика считает нулём, а не «не знаем»", () => {
    // Здесь ноль безопасен: карточка появляется только при >0, и упавший
    // счётчик просто её не покажет.
    expect(toAdvisorInput(empty, NOW).unionIncomingLikes).toBe(0);
  });
});
