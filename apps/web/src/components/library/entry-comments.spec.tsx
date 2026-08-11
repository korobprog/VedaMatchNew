import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LibraryCommentDto } from "@vedamatch/shared";
import { EntryComments } from "./entry-comments";

const existing: LibraryCommentDto = {
  id: "comment-1",
  entryId: "entry-1",
  body: "Очень помогло",
  status: "published",
  createdAt: "2026-08-11T10:00:00.000Z",
  author: { id: "user-2", name: "Нитай" },
  canDelete: false,
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("EntryComments", () => {
  it("appends a sent comment without reloading the page", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 201,
        json: () =>
          Promise.resolve({
            ...existing,
            id: "comment-2",
            body: "Спасибо",
            author: { id: "user-1", name: "Арджуна" },
            canDelete: true,
          }),
      }),
    );

    render(
      <EntryComments
        locale="ru"
        entryId="entry-1"
        initialComments={[existing]}
      />,
    );

    await userEvent.type(screen.getByLabelText(/Ваш комментарий/), "Спасибо");
    await userEvent.click(screen.getByRole("button", { name: "Отправить" }));

    await waitFor(() => {
      expect(screen.getByText("Спасибо")).toBeDefined();
    });
    expect(screen.getByText("Очень помогло")).toBeDefined();
  });

  it("explains a rate limit instead of failing silently", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 429 }),
    );

    render(<EntryComments locale="ru" entryId="entry-1" initialComments={[]} />);

    await userEvent.type(screen.getByLabelText(/Ваш комментарий/), "Ещё один");
    await userEvent.click(screen.getByRole("button", { name: "Отправить" }));

    await waitFor(() => {
      expect(
        screen.getByText("Слишком много комментариев подряд, попробуйте позже"),
      ).toBeDefined();
    });
  });

  it("offers deletion only for own comments", () => {
    render(
      <EntryComments
        locale="ru"
        entryId="entry-1"
        initialComments={[existing, { ...existing, id: "c2", canDelete: true }]}
      />,
    );

    expect(screen.getAllByLabelText("Удалить комментарий")).toHaveLength(1);
  });
});
