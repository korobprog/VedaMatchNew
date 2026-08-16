import { describe, expect, it } from "vitest";
import type {
  MotivationAdminCandidateDto,
  MotivationReviewStatus,
} from "@vedamatch/shared";
import {
  countQueue,
  selectArchivedPosts,
  selectImagePosts,
  selectTextPosts,
} from "./queue-selectors";

function post(
  id: string,
  reviewStatus: MotivationReviewStatus,
  textApprovedAt: string | null = null,
): MotivationAdminCandidateDto {
  return { id, reviewStatus, textApprovedAt } as MotivationAdminCandidateDto;
}

describe("queue selectors", () => {
  const posts = [
    post("a", "discovered"),
    post("b", "text_review"),
    post("c", "image_review", "2026-08-16T00:00:00.000Z"),
    post("d", "published", "2026-08-16T00:00:00.000Z"),
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

  it("treats everything outside the queue as archived", () => {
    expect(selectArchivedPosts(posts).map((item) => item.id)).toEqual(["d", "e"]);
  });

  it("counts only what is actually waiting for the admin", () => {
    // Пять постов всего, но опубликованный и отклонённый ничего не ждут.
    expect(countQueue(posts)).toBe(3);
  });
});
