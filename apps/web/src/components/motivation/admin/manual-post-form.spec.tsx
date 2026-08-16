import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MotivationCategoryDto } from "@vedamatch/shared";
import { ManualPostForm } from "./manual-post-form";

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
];

function okFetch() {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    text: async () =>
      JSON.stringify({
        quoteId: "q1",
        postId: "p1",
        reviewStatus: "image_queued",
      }),
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function sentBody(fetchMock: ReturnType<typeof vi.fn>) {
  return JSON.parse(fetchMock.mock.calls[0][1].body as string);
}

async function fillRequired(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("Текст цитаты"), "Не сдавайся.");
  await user.type(screen.getByLabelText("Автор"), "Шрила Прабхупада");
  await user.type(screen.getByLabelText("Заголовок"), "Идти до конца");
  await user.type(screen.getByLabelText("Пояснение"), "Своими словами.");
}

describe("ManualPostForm", () => {
  beforeEach(() => {
    refresh.mockReset();
    vi.unstubAllGlobals();
  });

  it("stays disabled until the quote, author, title and explanation are filled", async () => {
    const user = userEvent.setup();
    render(<ManualPostForm categories={categories} />);

    const submit = screen.getByRole("button", { name: /Создать/ });
    expect(submit).toBeDisabled();

    await fillRequired(user);
    expect(submit).toBeEnabled();
  });

  it("posts the copy the admin wrote, not a generated one", async () => {
    const fetchMock = okFetch();
    const user = userEvent.setup();

    render(<ManualPostForm categories={categories} />);
    await fillRequired(user);
    await user.click(screen.getByRole("button", { name: /Создать/ }));

    expect(fetchMock.mock.calls[0][0]).toContain("/admin/motivation/manual-posts");
    expect(sentBody(fetchMock)).toMatchObject({
      originalText: "Не сдавайся.",
      author: "Шрила Прабхупада",
      copy: { title: "Идти до конца", explanation: "Своими словами." },
      profileTypes: ["user"],
      audienceTrack: "universal",
      category: "smirenie",
    });
  });

  it("omits an extra language that was only half filled", async () => {
    const fetchMock = okFetch();
    const user = userEvent.setup();

    render(<ManualPostForm categories={categories} />);
    await fillRequired(user);
    await user.type(screen.getByLabelText("Заголовок · English"), "Go on");
    await user.click(screen.getByRole("button", { name: /Создать/ }));

    // Заголовок без пояснения — не перевод; пусть язык возьмёт основной текст.
    expect(sentBody(fetchMock)).not.toHaveProperty("translations");
  });

  it("sends a fully filled extra language", async () => {
    const fetchMock = okFetch();
    const user = userEvent.setup();

    render(<ManualPostForm categories={categories} />);
    await fillRequired(user);
    await user.type(screen.getByLabelText("Заголовок · English"), "Go on");
    await user.type(screen.getByLabelText("Пояснение · English"), "In my words.");
    await user.click(screen.getByRole("button", { name: /Создать/ }));

    expect(sentBody(fetchMock).translations).toEqual({
      en: { title: "Go on", explanation: "In my words.", storyText: "" },
    });
  });

  it("keeps the category field visible when the dictionary is empty", () => {
    // Раньше поле просто исчезало, и пустой справочник было не отличить от
    // несработавшей загрузки.
    render(<ManualPostForm categories={[]} />);

    expect(screen.getByLabelText("Категория")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Завести категорию" }),
    ).toHaveAttribute("href", "/admin/motivation/categories");
  });

  it("collects every chosen audience", async () => {
    const fetchMock = okFetch();
    const user = userEvent.setup();

    render(<ManualPostForm categories={categories} />);
    await fillRequired(user);
    await user.click(screen.getByRole("checkbox", { name: "Преданный" }));
    await user.click(screen.getByRole("button", { name: /Создать/ }));

    expect(sentBody(fetchMock).profileTypes).toEqual(["user", "devotee"]);
  });

  it("previews the card as the admin types", async () => {
    const user = userEvent.setup();
    render(<ManualPostForm categories={categories} />);

    const preview = screen.getByLabelText("Предпросмотр");
    expect(preview).toHaveTextContent("Заголовок");

    await user.type(screen.getByLabelText("Заголовок"), "Идти до конца");
    await user.type(screen.getByLabelText("Текст цитаты"), "Не сдавайся.");
    expect(preview).toHaveTextContent("Идти до конца");
    expect(preview).toHaveTextContent("Не сдавайся.");
  });

  it("reports that the text is already approved and links to the queue", async () => {
    okFetch();
    const user = userEvent.setup();

    render(<ManualPostForm categories={categories} />);
    await fillRequired(user);
    await user.click(screen.getByRole("button", { name: /Создать/ }));

    const status = await screen.findByRole("status");
    expect(status).toHaveTextContent("Мотивация создана, текст одобрен");
    expect(status).toHaveTextContent("Изображение создаётся");
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it("shows the server's message when creation fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        text: async () => "This quote has already been added",
      }),
    );
    const user = userEvent.setup();

    render(<ManualPostForm categories={categories} />);
    await fillRequired(user);
    await user.click(screen.getByRole("button", { name: /Создать/ }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "This quote has already been added",
    );
    expect(refresh).not.toHaveBeenCalled();
  });
});
