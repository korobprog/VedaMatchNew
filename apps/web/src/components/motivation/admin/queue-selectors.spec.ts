import { describe, expect, it } from "vitest";
import type {
  MotivationAdminCandidateDto,
  MotivationReviewStatus,
} from "@vedamatch/shared";
import {
  countQueue,
  selectImagePosts,
  selectPublishedPosts,
  selectSetAsidePosts,
  selectTextPosts,
} from "./queue-selectors";

function post(
  id: string,
  reviewStatus: MotivationReviewStatus,
  textApprovedAt: string | null = null,
  status: MotivationAdminCandidateDto["status"] = "draft",
): MotivationAdminCandidateDto {
  return {
    id,
    reviewStatus,
    textApprovedAt,
    status,
  } as MotivationAdminCandidateDto;
}

describe("queue selectors", () => {
  const posts = [
    post("a", "discovered"),
    post("b", "text_review"),
    post("c", "image_review", "2026-08-16T00:00:00.000Z"),
    post("d", "published", "2026-08-16T00:00:00.000Z", "published"),
    post("e", "rejected"),
  ];

  it("splits the queue by the stage each post waits at", () => {
    expect(selectTextPosts(posts).map((item) => item.id)).toEqual(["a", "b"]);
    expect(selectImagePosts(posts).map((item) => item.id)).toEqual(["c"]);
  });

  it("routes a failure to the stage it fell over at", () => {
    const failedEarly = post("f", "failed");
    const failedLate = post("g", "failed", "2026-08-16T00:00:00.000Z");

    expect(selectTextPosts([failedEarly, failedLate]).map((i) => i.id)).toEqual(["f"]);
    expect(selectImagePosts([failedEarly, failedLate]).map((i) => i.id)).toEqual(["g"]);
  });

  it("опубликованное живёт отдельно от отложенного", () => {
    expect(selectPublishedPosts(posts).map((item) => item.id)).toEqual(["d"]);
    expect(selectSetAsidePosts(posts).map((item) => item.id)).toEqual(["e"]);
  });

  it("скрытая карточка уходит из опубликованного, хотя стадию прошла", () => {
    // `reviewStatus` у неё так и остаётся `published`, но из ленты она ушла,
    // и держать её среди опубликованного значило бы врать разделом.
    const hidden = post("h", "published", "2026-08-16T00:00:00.000Z", "hidden");

    expect(selectPublishedPosts([hidden])).toEqual([]);
    expect(selectSetAsidePosts([hidden]).map((item) => item.id)).toEqual(["h"]);
  });

  it("counts only what is actually waiting for the admin", () => {
    // Пять постов всего, но опубликованный и отклонённый ничего не ждут.
    expect(countQueue(posts)).toBe(3);
  });
});
