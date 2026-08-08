import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ManualQuoteForm } from "./manual-quote-form";

const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

async function fillValidForm(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("Текст цитаты (оригинал)"), "Exact quote text.");
  await user.type(screen.getByLabelText("Автор"), "Author Name");
  await user.type(screen.getByLabelText("Произведение"), "Work Title");
  await user.type(screen.getByLabelText("Глава/стих"), "1.1");
  await user.type(screen.getByLabelText("Контекст"), "Context around the quote.");
}

describe("ManualQuoteForm", () => {
  beforeEach(() => {
    refresh.mockReset();
    vi.unstubAllGlobals();
  });

  it("submits a manual quote and refreshes on success", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ quoteId: "quote-1", postId: "post-1" }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<ManualQuoteForm />);
    await fillValidForm(user);
    await user.click(screen.getByRole("button", { name: "Добавить в очередь" }));

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/admin/motivation/quotes"),
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        body: JSON.stringify({
          originalText: "Exact quote text.",
          originalLanguage: "ru",
          author: "Author Name",
          work: "Work Title",
          locator: "1.1",
          sourceUrl: undefined,
          contextExcerpt: "Context around the quote.",
        }),
      }),
    );
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(screen.getByLabelText("Текст цитаты (оригинал)")).toHaveValue("");
  });

  it("disables submission until every required field is filled", async () => {
    render(<ManualQuoteForm />);
    expect(screen.getByRole("button", { name: "Добавить в очередь" })).toBeDisabled();
  });

  it("shows an inline error when the API rejects the quote", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 400, text: async () => "This quote has already been added" }),
    );
    const user = userEvent.setup();

    render(<ManualQuoteForm />);
    await fillValidForm(user);
    await user.click(screen.getByRole("button", { name: "Добавить в очередь" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("This quote has already been added");
    expect(refresh).not.toHaveBeenCalled();
  });
});
