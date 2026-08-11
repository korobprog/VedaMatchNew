import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BookmarkButton } from "./bookmark-button";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("BookmarkButton", () => {
  it("saves the entry and bumps the counter", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 204 });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <BookmarkButton
        locale="ru"
        entryId="entry-1"
        initialBookmarked={false}
        initialCount={2}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: /В избранное/ }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /В избранном/ })).toBeDefined();
    });
    expect(screen.getByText("3")).toBeDefined();
    expect(fetchMock.mock.calls[0][1].method).toBe("POST");
  });

  it("rolls the state back when the request fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }));

    render(
      <BookmarkButton
        locale="ru"
        entryId="entry-1"
        initialBookmarked={false}
        initialCount={2}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: /В избранное/ }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /В избранное/ })).toBeDefined();
    });
    expect(screen.getByText("2")).toBeDefined();
  });

  it("removes an already saved entry", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 204 });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <BookmarkButton
        locale="ru"
        entryId="entry-1"
        initialBookmarked
        initialCount={1}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: /В избранном/ }));

    await waitFor(() => {
      expect(fetchMock.mock.calls[0][1].method).toBe("DELETE");
    });
  });
});
