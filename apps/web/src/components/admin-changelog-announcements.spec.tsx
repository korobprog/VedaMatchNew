import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminAnnouncementDto } from "@vedamatch/shared";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));
vi.mock("@/lib/http-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/http-client")>()),
  apiFetch: vi.fn(),
}));
vi.mock("@/lib/api-base", () => ({ apiBase: () => "http://api.test" }));

import { apiFetch } from "@/lib/http-client";
import { AdminChangelogAnnouncements } from "./admin-changelog-announcements";

const request = vi.mocked(apiFetch);

const news: AdminAnnouncementDto = {
  id: "a1",
  titleRu: "Медиатека и другое",
  titleEn: "Media library and more",
  bodyRu: "Текст",
  bodyEn: "Text",
  status: "published",
  publishedAt: "2026-09-01T00:00:00.000Z",
  pinned: false,
  publishAt: null,
  expiresAt: null,
  broadcastAt: null,
  broadcastCount: 0,
  acknowledgedCount: 3,
  images: [],
};

const before = (a: Element, b: Element) =>
  Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

beforeEach(() => {
  request.mockReset();
});

// VED-136: поля новой новости — наверху, а не под всем списком.
describe("AdminChangelogAnnouncements", () => {
  it("ставит «Добавить новость» над списком новостей", () => {
    render(<AdminChangelogAnnouncements announcements={[news]} />);

    const add = screen.getByRole("button", { name: "Добавить новость" });
    expect(before(add, screen.getByText("Медиатека и другое"))).toBe(true);
  });

  it("открытая форма тоже над списком", async () => {
    render(<AdminChangelogAnnouncements announcements={[news]} />);

    await userEvent.click(screen.getByRole("button", { name: "Добавить новость" }));

    const title = screen.getByPlaceholderText("Заголовок (RU)");
    expect(before(title, screen.getByText("Медиатека и другое"))).toBe(true);
  });

  it("по ссылке «Добавить новость» из шапки форма открыта сразу и стоит первой", () => {
    render(<AdminChangelogAnnouncements announcements={[news]} startCreating />);

    const title = screen.getByPlaceholderText("Заголовок (RU)");
    expect(before(title, screen.getByText("Медиатека и другое"))).toBe(true);
  });
});

// VED-137: картинки к новости.
describe("AdminChangelogAnnouncements — картинки", () => {
  const KEY = "announcements/0000000a-aaaa-4bbb-8ccc-dddddddddddd.webp";
  const uploaded = (width: number, height: number) =>
    new Response(
      JSON.stringify({
        images: [{ key: KEY, url: "https://cdn.test/a.webp", width, height }],
        failed: [],
      }),
      { status: 200 },
    );

  it("загружает выбранную картинку и отдаёт её ключ при сохранении", async () => {
    const user = userEvent.setup();
    request
      .mockResolvedValueOnce(uploaded(1280, 720))
      .mockResolvedValueOnce(new Response("{}", { status: 200 }));
    render(<AdminChangelogAnnouncements announcements={[]} startCreating />);

    await user.type(screen.getByPlaceholderText("Заголовок (RU)"), "Скрин");
    await user.type(screen.getByPlaceholderText("Заголовок (EN)"), "Shot");
    await user.type(screen.getByPlaceholderText("Текст (RU)"), "Текст");
    await user.type(screen.getByPlaceholderText("Текст (EN)"), "Text");
    await user.upload(
      screen.getByTestId("news-images-input"),
      new File(["x"], "shot.png", { type: "image/png" }),
    );

    expect(await screen.findByRole("img", { name: "Картинка 1" })).toHaveAttribute(
      "src",
      "https://cdn.test/a.webp",
    );
    const [uploadUrl, uploadInit] = request.mock.calls[0];
    expect(uploadUrl).toBe("http://api.test/admin/changelog/announcement-images");
    expect((uploadInit?.body as FormData).getAll("files")).toHaveLength(1);

    await user.click(screen.getByRole("button", { name: "Сохранить" }));
    await waitFor(() => expect(request).toHaveBeenCalledTimes(2));
    const saved = JSON.parse(String(request.mock.calls[1][1]?.body));
    expect(saved.images).toEqual([{ key: KEY, width: 1280, height: 720 }]);
  });

  it("убирает картинку из новости крестиком", async () => {
    const user = userEvent.setup();
    render(
      <AdminChangelogAnnouncements
        announcements={[
          {
            ...news,
            images: [{ key: KEY, url: "https://cdn.test/a.webp", width: 10, height: 10 }],
          },
        ]}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Редактировать" }));
    await user.click(screen.getByRole("button", { name: "Убрать картинку 1" }));

    expect(screen.queryByRole("img", { name: "Картинка 1" })).not.toBeInTheDocument();
    expect(screen.getByText("(0 из 6)")).toBeInTheDocument();
  });

  it("неподходящий файл не загружает и говорит почему", async () => {
    const user = userEvent.setup({ applyAccept: false });
    render(<AdminChangelogAnnouncements announcements={[]} startCreating />);

    await user.upload(
      screen.getByTestId("news-images-input"),
      new File(["x"], "scan.heic", { type: "image/heic" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "scan.heic: подходят JPG, PNG и WebP",
    );
    expect(request).not.toHaveBeenCalled();
  });

  it("скриншот из буфера, вставленный в форму, загружается", async () => {
    request.mockResolvedValueOnce(uploaded(10, 10));
    render(<AdminChangelogAnnouncements announcements={[]} startCreating />);

    const field = screen.getByPlaceholderText("Текст (RU)");
    const shot = new File(["x"], "image.png", { type: "image/png" });
    const paste = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(paste, "clipboardData", { value: { files: [shot] } });
    field.dispatchEvent(paste);

    expect(await screen.findByRole("img", { name: "Картинка 1" })).toBeInTheDocument();
    expect(paste.defaultPrevented).toBe(true);
  });
});

// VED-144: автоперевод на английский в форме новости.
describe("AdminChangelogAnnouncements — перевод на английский", () => {
  const translated = () =>
    new Response(JSON.stringify({ titleEn: "News", bodyEn: "Text" }), { status: 200 });

  afterEach(() => vi.restoreAllMocks());

  it("кнопка неактивна, пока нет русской версии", () => {
    render(<AdminChangelogAnnouncements announcements={[]} startCreating />);

    expect(screen.getByRole("button", { name: "Перевести на английский" })).toBeDisabled();
  });

  it("заполняет пустые EN-поля переводом русских", async () => {
    const user = userEvent.setup();
    request.mockResolvedValueOnce(translated());
    render(<AdminChangelogAnnouncements announcements={[]} startCreating />);

    await user.type(screen.getByPlaceholderText("Заголовок (RU)"), "Новость");
    await user.type(screen.getByPlaceholderText("Текст (RU)"), "Текст");
    await user.click(screen.getByRole("button", { name: "Перевести на английский" }));

    expect(await screen.findByDisplayValue("News")).toBe(
      screen.getByPlaceholderText("Заголовок (EN)"),
    );
    expect(screen.getByPlaceholderText("Текст (EN)")).toHaveValue("Text");
    expect(screen.getByRole("status")).toHaveTextContent("проверьте");
    const [url, init] = request.mock.calls[0];
    expect(url).toBe("http://api.test/admin/changelog/announcements/translate");
    expect(JSON.parse(String(init?.body))).toEqual({ titleRu: "Новость", bodyRu: "Текст" });
  });

  it("заполненную английскую версию без подтверждения не трогает", async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<AdminChangelogAnnouncements announcements={[news]} />);

    await user.click(screen.getByRole("button", { name: "Редактировать" }));
    await user.click(screen.getByRole("button", { name: "Перевести на английский" }));

    expect(confirm).toHaveBeenCalled();
    expect(request).not.toHaveBeenCalled();
    expect(screen.getByPlaceholderText("Заголовок (EN)")).toHaveValue(
      "Media library and more",
    );
  });

  it("с подтверждением заменяет английскую версию", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    request.mockResolvedValueOnce(translated());
    render(<AdminChangelogAnnouncements announcements={[news]} />);

    await user.click(screen.getByRole("button", { name: "Редактировать" }));
    await user.click(screen.getByRole("button", { name: "Перевести на английский" }));

    await waitFor(() =>
      expect(screen.getByPlaceholderText("Заголовок (EN)")).toHaveValue("News"),
    );
  });

  it("показывает понятную ошибку, если переводчик недоступен", async () => {
    const user = userEvent.setup();
    request.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ statusCode: 503, message: "Переводчик не ответил за 30 секунд." }),
        { status: 503 },
      ),
    );
    render(<AdminChangelogAnnouncements announcements={[]} startCreating />);

    await user.type(screen.getByPlaceholderText("Заголовок (RU)"), "Новость");
    await user.click(screen.getByRole("button", { name: "Перевести на английский" }));

    expect(await screen.findByText("Переводчик не ответил за 30 секунд.")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Заголовок (EN)")).toHaveValue("");
  });
});
