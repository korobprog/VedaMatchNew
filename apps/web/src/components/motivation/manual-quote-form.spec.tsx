import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MotivationCategoryDto } from "@vedamatch/shared";
import { ManualQuoteForm, detectLanguage } from "./manual-quote-form";

const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const categories: MotivationCategoryDto[] = [
  {
    id: "cat-1",
    slug: "smirenie",
    title: "Смирение",
    sortOrder: 0,
    isDefault: true,
    parentId: null,
    postCount: 0,
  },
  {
    id: "cat-2",
    slug: "utro",
    title: "Утренняя практика",
    sortOrder: 10,
    isDefault: false,
    parentId: "cat-1",
    postCount: 0,
  },
];

function okFetch() {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ quoteId: "quote-1", postId: "post-1" }),
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function bodyOf(fetchMock: ReturnType<typeof vi.fn>) {
  return JSON.parse(fetchMock.mock.calls[0][1].body as string);
}

describe("detectLanguage", () => {
  it("picks the language from the script of the quote", () => {
    expect(detectLanguage("Смирение выше всего")).toBe("ru");
    expect(detectLanguage("Chant and be happy")).toBe("en");
    expect(detectLanguage("धर्म")).toBe("hi");
  });
});

describe("ManualQuoteForm", () => {
  beforeEach(() => {
    refresh.mockReset();
    vi.unstubAllGlobals();
  });

  it("submits with only the quote text and the author filled in", async () => {
    const fetchMock = okFetch();
    const user = userEvent.setup();

    render(<ManualQuoteForm />);
    await user.type(screen.getByLabelText("Текст цитаты (оригинал)"), "Exact quote text.");
    await user.type(screen.getByLabelText("Автор"), "Author Name");
    await user.click(screen.getByRole("button", { name: "Добавить в очередь" }));

    expect(bodyOf(fetchMock)).toEqual({
      originalText: "Exact quote text.",
      originalLanguage: "en",
      author: "Author Name",
    });
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(screen.getByLabelText("Текст цитаты (оригинал)")).toHaveValue("");
  });

  it("confirms what happens next and links to the queue after adding", async () => {
    okFetch();
    const user = userEvent.setup();

    render(<ManualQuoteForm />);
    expect(screen.queryByRole("status")).toBeNull();

    await user.type(screen.getByLabelText("Текст цитаты (оригинал)"), "Exact quote.");
    await user.type(screen.getByLabelText("Автор"), "Author Name");
    await user.click(screen.getByRole("button", { name: "Добавить в очередь" }));

    const status = await screen.findByRole("status");
    expect(status).toHaveTextContent("Цитата добавлена");
    expect(status).toHaveTextContent("Author Name");
    expect(status).toHaveTextContent("Нейросеть готовит пояснение и переводы.");
    expect(screen.getByRole("link", { name: /Открыть очередь/ })).toHaveAttribute(
      "href",
      "/admin/motivation/queue",
    );
  });

  it("keeps the submit button disabled until text and author are present", async () => {
    const user = userEvent.setup();
    render(<ManualQuoteForm />);

    const submit = screen.getByRole("button", { name: "Добавить в очередь" });
    expect(submit).toBeDisabled();

    await user.type(screen.getByLabelText("Текст цитаты (оригинал)"), "Quote");
    expect(submit).toBeDisabled();

    await user.type(screen.getByLabelText("Автор"), "Author");
    expect(submit).toBeEnabled();
  });

  it("detects the language from the quote but yields to a manual choice", async () => {
    const fetchMock = okFetch();
    const user = userEvent.setup();

    render(<ManualQuoteForm />);
    await user.type(screen.getByLabelText("Текст цитаты (оригинал)"), "Смирение выше всего");
    expect(screen.getByLabelText("Язык оригинала")).toHaveValue("ru");

    await user.selectOptions(screen.getByLabelText("Язык оригинала"), "en");
    await user.type(screen.getByLabelText("Текст цитаты (оригинал)"), " ещё");
    expect(screen.getByLabelText("Язык оригинала")).toHaveValue("en");

    await user.type(screen.getByLabelText("Автор"), "Автор");
    await user.click(screen.getByRole("button", { name: "Добавить в очередь" }));
    expect(bodyOf(fetchMock).originalLanguage).toBe("en");
  });

  it("sends the optional source fields only when they are filled", async () => {
    const fetchMock = okFetch();
    const user = userEvent.setup();

    render(<ManualQuoteForm />);
    await user.type(screen.getByLabelText("Текст цитаты (оригинал)"), "Quote");
    await user.type(screen.getByLabelText("Автор"), "Author");
    await user.type(screen.getByLabelText("Произведение"), "  Work Title  ");
    await user.type(screen.getByLabelText("Ссылка на источник"), "https://example.com");
    await user.click(screen.getByRole("button", { name: "Добавить в очередь" }));

    expect(bodyOf(fetchMock)).toMatchObject({
      work: "Work Title",
      sourceUrl: "https://example.com",
    });
    expect(bodyOf(fetchMock)).not.toHaveProperty("locator");
  });

  it("preselects the default category and offers subcategories", async () => {
    const fetchMock = okFetch();
    const user = userEvent.setup();

    render(<ManualQuoteForm categories={categories} />);
    expect(screen.getByLabelText("Категория")).toHaveValue("smirenie");

    await user.selectOptions(screen.getByLabelText("Категория"), "utro");
    await user.type(screen.getByLabelText("Текст цитаты (оригинал)"), "Quote");
    await user.type(screen.getByLabelText("Автор"), "Author");
    await user.click(screen.getByRole("button", { name: "Добавить в очередь" }));

    expect(bodyOf(fetchMock).category).toBe("utro");
  });

  it("shows an inline error when the API rejects the quote", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        text: async () => "This quote has already been added",
      }),
    );
    const user = userEvent.setup();

    render(<ManualQuoteForm />);
    await user.type(screen.getByLabelText("Текст цитаты (оригинал)"), "Quote");
    await user.type(screen.getByLabelText("Автор"), "Author");
    await user.click(screen.getByRole("button", { name: "Добавить в очередь" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "This quote has already been added",
    );
    expect(refresh).not.toHaveBeenCalled();
  });
});
