import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EntryLikeButton } from "./entry-like-button";

afterEach(() => {
  vi.unstubAllGlobals();
});

function jsonResponse(body: unknown) {
  return { ok: true, status: 200, json: () => Promise.resolve(body) };
}

describe("EntryLikeButton", () => {
  it("likes the entry and takes the count from the server", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ liked: true, likeCount: 7 }));
    vi.stubGlobal("fetch", fetchMock);

    render(
      <EntryLikeButton
        locale="ru"
        entryId="entry-1"
        initialLiked={false}
        initialCount={2}
      />,
    );

    const button = screen.getByRole("button", { name: "Нравится" });
    expect(button.getAttribute("aria-pressed")).toBe("false");

    await userEvent.click(button);

    await waitFor(() => {
      expect(screen.getByText("7")).toBeDefined();
    });
    expect(button.getAttribute("aria-pressed")).toBe("true");
    expect(fetchMock.mock.calls[0][0]).toMatch(
      /\/library\/entries\/entry-1\/like$/,
    );
    expect(fetchMock.mock.calls[0][1].method).toBe("PUT");
  });

  it("takes the like back with DELETE", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ liked: false, likeCount: 0 }));
    vi.stubGlobal("fetch", fetchMock);

    render(
      <EntryLikeButton
        locale="ru"
        entryId="entry-1"
        initialLiked
        initialCount={1}
      />,
    );

    const button = screen.getByRole("button", { name: "Нравится" });
    expect(screen.getByText("1")).toBeDefined();

    await userEvent.click(button);

    await waitFor(() => {
      expect(button.getAttribute("aria-pressed")).toBe("false");
    });
    expect(screen.queryByText("1")).toBeNull();
    expect(fetchMock.mock.calls[0][1].method).toBe("DELETE");
  });

  it("rolls back when the request fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 404 }),
    );

    render(
      <EntryLikeButton
        locale="ru"
        entryId="entry-1"
        initialLiked={false}
        initialCount={2}
      />,
    );

    const button = screen.getByRole("button", { name: "Нравится" });
    await userEvent.click(button);

    await waitFor(() => {
      expect(button.getAttribute("aria-busy")).toBe("false");
    });
    expect(button.getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByText("2")).toBeDefined();
  });

  it("names itself in English", () => {
    render(
      <EntryLikeButton
        locale="en"
        entryId="entry-1"
        initialLiked={false}
        initialCount={0}
      />,
    );

    expect(screen.getByRole("button", { name: "Like" })).toBeDefined();
  });
});
