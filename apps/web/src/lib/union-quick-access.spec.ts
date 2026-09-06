import { describe, expect, it } from "vitest";
import { buildUnionQuickAccessData } from "./union-quick-access";

describe("buildUnionQuickAccessData", () => {
  it("returns all-empty defaults when every source is null", () => {
    const result = buildUnionQuickAccessData(null, null, null, null);

    expect(result).toEqual({
      unreadMessages: 0,
      incomingLikes: 0,
      previewAvatars: [],
      moreCount: 0,
      profileCompletionPercent: null,
      profileItems: [],
    });
  });

  it("reads unread messages from chats and incoming likes from counts", () => {
    const result = buildUnionQuickAccessData(
      { chats: [], unreadTotal: 3 },
      { incomingPending: 2 },
      null,
      null,
    );

    expect(result.unreadMessages).toBe(3);
    expect(result.incomingLikes).toBe(2);
  });

  it("caps preview avatars at 3 and computes the overflow count", () => {
    const recommendations = {
      items: [
        { user: { name: "Ана", avatarUrl: "https://x/a.jpg" } },
        { user: { name: "Борис", avatarUrl: null } },
        { user: { name: "Вера", avatarUrl: "https://x/v.jpg" } },
        { user: { name: "Глеб", avatarUrl: null } },
      ],
      total: 12,
      page: 1,
      pageSize: 3,
      totalPages: 4,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;

    const result = buildUnionQuickAccessData(null, null, null, recommendations);

    expect(result.previewAvatars).toEqual([
      { url: "https://x/a.jpg", initial: "А" },
      { url: null, initial: "Б" },
      { url: "https://x/v.jpg", initial: "В" },
    ]);
    expect(result.moreCount).toBe(9);
  });

  it("hides the overflow count when total fits within the preview", () => {
    const recommendations = {
      items: [{ user: { name: "Ана", avatarUrl: null } }],
      total: 1,
      page: 1,
      pageSize: 3,
      totalPages: 1,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;

    const result = buildUnionQuickAccessData(null, null, null, recommendations);

    expect(result.moreCount).toBe(0);
  });

  it("exposes profile completion percent only when below 100", () => {
    const below = buildUnionQuickAccessData(null, null, {
      profile: null,
      completeness: { percent: 72, items: [], missing: [], next: null },
    }, null);
    const complete = buildUnionQuickAccessData(null, null, {
      profile: null,
      completeness: { percent: 100, items: [], missing: [], next: null },
    }, null);

    expect(below.profileCompletionPercent).toBe(72);
    expect(complete.profileCompletionPercent).toBeNull();
    // Значки полей идут только вместе с полосой.
    expect(complete.profileItems).toEqual([]);
  });
});
