import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PicturePublishForm } from "./picture-publish-form";
import { ReelWizard } from "./reel-wizard";
import { fieldLabelClass } from "./field-label";

const categories = [
  { id: "c1", slug: "filosofiya", title: "Философия", sortOrder: 0, isDefault: true, parentId: null, postCount: 5, feed: "both" as const, artCount: 5, cardsCount: 0 },
  { id: "c2", slug: "vedy", title: "Веды", sortOrder: 1, isDefault: false, parentId: null, postCount: 3, feed: "both" as const, artCount: 3, cardsCount: 0 },
];

const quota = { enabled: true, unlimited: false, limit: 1, used: 0, remaining: 1 };

/** fetch, отвечающий по URL. */
function routeFetch(routes: Record<string, (init?: RequestInit) => unknown>) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const key = Object.keys(routes).find((pattern) => url.includes(pattern));
    if (!key) throw new Error(`unexpected ${url}`);
    const body = routes[key](init);
    return { ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) };
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const picture = () => new File(["png"], "cita.png", { type: "image/png" });

beforeEach(() => vi.restoreAllMocks());

describe("PicturePublishForm (VED-97)", () => {
  it("без картинки опубликовать нельзя", () => {
    render(<PicturePublishForm categories={categories} />);

    expect(screen.getByRole("button", { name: "Опубликовать" })).toBeDisabled();
  });

  it("картинка первым шагом: файл, категория, автор и источник уходят одной формой", async () => {
    const fetchMock = routeFetch({
      "/motivation/pictures": () => ({
        postId: "p1",
        slug: "picture-p1",
        category: "vedy",
        imageUrl: "https://cdn/p1.webp",
      }),
    });
    const onPublished = vi.fn();
    const user = userEvent.setup();
    render(<PicturePublishForm categories={categories} onPublished={onPublished} />);

    await user.upload(screen.getByLabelText("Картинка с цитатой из галереи"), picture());
    await user.selectOptions(screen.getByLabelText(/Категория/), "vedy");
    // Точные строки, а не /Автор/ и /Источник/: группа-обёртка (fieldset)
    // сама несёт aria-label «Источник и автор» (VED-203) и подошла бы под
    // свободный поиск подстроки.
    await user.type(screen.getByLabelText("Автор (необязательно)"), "Шрила Прабхупада");
    await user.type(screen.getByLabelText("Источник (необязательно)"), "Бхагавад-гита");
    await user.click(screen.getByRole("button", { name: "Опубликовать" }));

    await waitFor(() => expect(onPublished).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/motivation/pictures");
    const form = init.body as FormData;
    expect((form.get("file") as File).name).toBe("cita.png");
    expect(form.get("category")).toBe("vedy");
    expect(form.get("author")).toBe("Шрила Прабхупада");
    expect(form.get("work")).toBe("Бхагавад-гита");
    // Текст с картинки не набирали — поле не уходит вовсе.
    expect(form.get("text")).toBeNull();

    expect(screen.getByText("Картинка опубликована")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Открыть в ленте" })).toHaveAttribute(
      "href",
      "/motivation?post=picture-p1",
    );
  });

  it("заголовка группы «Автор / источник» на экране нет, имя группы осталось (VED-203)", () => {
    render(<PicturePublishForm categories={categories} />);

    // Строка над двумя полями с теми же словами читалась как лишняя.
    expect(screen.queryByText("Автор / источник")).not.toBeInTheDocument();
    // Но назначение группы скринридер по-прежнему называет — теми же
    // словами, что и мастер роликов.
    expect(
      screen.getByRole("group", { name: "Источник и автор" }),
    ).toBeInTheDocument();
  });

  it("подписи полей выделены тем же классом, что и в мастере роликов (VED-203)", () => {
    render(<PicturePublishForm categories={categories} />);

    for (const text of [
      "Картинка с цитатой (JPEG, PNG или WebP)",
      "Категория",
      "Автор (необязательно)",
      "Источник (необязательно)",
      "Текст с картинки (необязательно)",
    ])
      // Жирность и самый контрастный текстовый токен — иначе подпись
      // сливается с фоном страницы, на котором лежит форма.
      expect(screen.getByText(text).className).toContain(fieldLabelClass());
  });

  it("чужой формат не берёт и объясняет почему", async () => {
    const user = userEvent.setup({ applyAccept: false });
    render(<PicturePublishForm categories={categories} />);

    await user.upload(
      screen.getByLabelText("Картинка с цитатой из файлов"),
      new File(["gif"], "a.gif", { type: "image/gif" }),
    );

    expect(screen.getByText("Подойдёт JPEG, PNG или WebP")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Опубликовать" })).toBeDisabled();
  });

  it("берёт картинку из файлового менеджера без типа (VED-154)", async () => {
    const user = userEvent.setup({ applyAccept: false });
    render(<PicturePublishForm categories={categories} />);
    const files = screen.getByLabelText("Картинка с цитатой из файлов");
    expect(files).not.toHaveAttribute("accept");

    await user.upload(files, new File(["x"], "Download.jpeg", { type: "" }));

    expect(screen.getByText(/Картинка взята: Download\.jpeg/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Опубликовать" })).toBeEnabled();
  });
});

describe("ReelWizard — готовая картинка первым вариантом", () => {
  it("открывает форму картинки без шага с текстом", async () => {
    routeFetch({ "/motivation/reels/quota": () => quota });
    const user = userEvent.setup();
    render(<ReelWizard prefill={{}} donation={null} categories={categories} />);

    await user.click(screen.getByRole("button", { name: /Готовая картинка с цитатой/ }));

    expect(screen.getByText("Готовая картинка · один шаг")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Из галереи/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Из файлов/ })).toBeInTheDocument();
    expect(screen.queryByLabelText("Текст цитаты")).toBeNull();
  });
});
