import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { MotivationCategoryDto } from "@vedamatch/shared";
import { PictureUploadForm } from "./picture-upload-form";
import { apiFetch } from "@/lib/http-client";

vi.mock("@/lib/http-client", () => ({ apiFetch: vi.fn() }));

const CATEGORIES = [
  { id: "c1", slug: "daily", title: "Каждый день", parentId: null, isDefault: true },
  { id: "c2", slug: "shastra", title: "Шастры", parentId: null, isDefault: false },
] as MotivationCategoryDto[];

function picture(name: string, type = "image/jpeg") {
  return new File(["x"], name, { type });
}

function ok(slug: string) {
  return new Response(
    JSON.stringify({ postId: "p", slug, category: "shastra", imageUrl: "u" }),
    { status: 201, headers: { "content-type": "application/json" } },
  );
}

// jsdom не реализует showModal: без заглушки просмотр не открывается.
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function close() {
    this.open = false;
    this.dispatchEvent(new Event("close"));
  };
});

beforeEach(() => {
  // jsdom не умеет blob-ссылки: превью здесь — просто строка.
  URL.createObjectURL = vi.fn(() => "blob:preview");
  URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  vi.mocked(apiFetch).mockReset();
});

describe("PictureUploadForm", () => {
  it("publishes each picture into the category it was opened for", async () => {
    vi.mocked(apiFetch)
      .mockResolvedValueOnce(ok("picture-1"))
      .mockResolvedValueOnce(ok("picture-2"));
    const user = userEvent.setup();
    render(<PictureUploadForm categories={CATEGORIES} initialCategory="shastra" />);

    await user.upload(screen.getByLabelText("Картинки с афоризмами"), [
      picture("a.jpg"),
      picture("b.png", "image/png"),
    ]);
    await user.type(
      screen.getAllByLabelText("Текст с картинки (необязательно)")[0],
      "Кто видит меня везде",
    );
    await user.type(screen.getByLabelText(/^Автор цитаты/), "Кришна");
    await user.click(screen.getByRole("button", { name: "Выбрать все" }));
    await user.click(
      screen.getByRole("button", { name: "Опубликовать в «Шастры»: 2" }),
    );

    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent("Опубликовано 2 из 2"),
    );
    const calls = vi.mocked(apiFetch).mock.calls;
    expect(calls).toHaveLength(2);
    expect(String(calls[0][0])).toMatch(/\/admin\/motivation\/pictures$/);
    const first = calls[0][1]?.body as FormData;
    expect(first.get("category")).toBe("shastra");
    expect(first.get("text")).toBe("Кто видит меня везде");
    expect(first.get("author")).toBe("Кришна");
    expect((first.get("file") as File).name).toBe("a.jpg");
    // Текст набран только у первой — у второй поля нет вовсе.
    expect((calls[1][1]?.body as FormData).get("text")).toBeNull();
    expect(screen.getAllByRole("link", { name: "Открыть" })[0]).toHaveAttribute(
      "href",
      "/motivation?tab=cards&category=shastra&post=picture-1",
    );
  });

  // Упавший файл не хоронит остальные и говорит словами сервера.
  it("shows the server's reason for a failed file and keeps going", async () => {
    vi.mocked(apiFetch)
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ message: "Картинка слишком маленькая" }),
          { status: 400 },
        ),
      )
      .mockResolvedValueOnce(ok("picture-2"));
    const user = userEvent.setup();
    render(<PictureUploadForm categories={CATEGORIES} />);

    await user.upload(screen.getByLabelText("Картинки с афоризмами"), [
      picture("small.jpg"),
      picture("fine.jpg"),
    ]);
    await user.click(screen.getByRole("button", { name: "Выбрать все" }));
    await user.click(
      screen.getByRole("button", { name: "Опубликовать в «Каждый день»: 2" }),
    );

    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "Опубликовано 1 из 2, не загрузилось: 1",
      ),
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Картинка слишком маленькая",
    );
    // Отказ по файлу повтором не лечится — кнопке больше нечего отправлять.
    expect(screen.getByRole("button", { name: "Опубликовать" })).toBeDisabled();
  });

  it("lets a file be taken back before sending", async () => {
    const user = userEvent.setup();
    render(<PictureUploadForm categories={CATEGORIES} />);

    await user.upload(screen.getByLabelText("Картинки с афоризмами"), [
      picture("a.jpg"),
    ]);
    const list = screen.getByRole("list", { name: "Картинки к публикации" });
    await user.click(within(list).getByRole("button", { name: "Убрать a.jpg" }));

    expect(screen.queryByRole("list", { name: "Картинки к публикации" })).toBeNull();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:preview");
    expect(apiFetch).not.toHaveBeenCalled();
  });
});

describe("PictureUploadForm — файлы и категории открыток", () => {
  it("берёт картинки и через файловый менеджер (VED-154)", async () => {
    const user = userEvent.setup({ applyAccept: false });
    render(<PictureUploadForm categories={CATEGORIES} />);
    expect(screen.getByRole("button", { name: "Из галереи" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Из файлов" })).toBeVisible();
    const files = screen.getByLabelText("Картинки с афоризмами из файлов");
    // Без accept: иначе Android снова откроет одну галерею.
    expect(files).not.toHaveAttribute("accept");
    await user.upload(files, [new File(["x"], "otkrytka.webp", { type: "" })]);
    expect(screen.getByText(/otkrytka\.webp/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Выбрать картинку 1" }));
    expect(
      screen.getByRole("button", { name: "Опубликовать в «Каждый день»: 1" }),
    ).toBeEnabled();
  });

  it("не предлагает категории «Для вас» (VED-139)", () => {
    render(
      <PictureUploadForm
        categories={[
          ...CATEGORIES,
          {
            id: "c3",
            slug: "art-only",
            title: "Только иллюстрации",
            parentId: null,
            isDefault: false,
            feed: "art",
          } as MotivationCategoryDto,
        ]}
      />,
    );
    expect(
      screen.queryByRole("option", { name: "Только иллюстрации" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Шастры" })).toBeInTheDocument();
  });
});

// VED-302: картинку сначала смотрят кликом, а выбирают рамочкой в углу.
describe("PictureUploadForm — посмотреть и выбрать", () => {
  async function withTwo() {
    const user = userEvent.setup();
    render(<PictureUploadForm categories={CATEGORIES} />);
    await user.upload(screen.getByLabelText("Картинки с афоризмами"), [
      picture("a.jpg"),
      picture("b.jpg"),
    ]);
    return user;
  }

  it("клик по картинке открывает просмотр и не выбирает её", async () => {
    const user = await withTwo();
    await user.click(
      screen.getByRole("button", { name: "Посмотреть картинку 1: a.jpg" }),
    );

    const dialog = screen.getByRole("dialog", {
      name: "Просмотр картинки 1 из 2",
    });
    expect(dialog).toHaveAttribute("open");
    expect(within(dialog).getByRole("img")).toHaveAccessibleName(
      "Картинка 1: a.jpg",
    );
    expect(
      screen.getByRole("button", { name: "Выбрать картинку 1", hidden: true }),
    ).toHaveAttribute("aria-pressed", "false");
    expect(
      screen.getByRole("button", { name: "Опубликовать", hidden: true }),
    ).toBeDisabled();
  });

  it("стрелка листает к соседней, Esc закрывает и возвращает фокус", async () => {
    const user = await withTwo();
    const thumb = screen.getByRole("button", {
      name: "Посмотреть картинку 1: a.jpg",
    });
    await user.click(thumb);
    await user.keyboard("{ArrowRight}");
    expect(
      screen.getByRole("dialog", { name: "Просмотр картинки 2 из 2" }),
    ).toBeInTheDocument();
    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(
      screen.getByRole("button", { name: "Посмотреть картинку 2: b.jpg" }),
    ).toHaveFocus();
  });

  it("крестик закрывает просмотр", async () => {
    const user = await withTwo();
    await user.click(
      screen.getByRole("button", { name: "Посмотреть картинку 2: b.jpg" }),
    );
    await user.click(screen.getByRole("button", { name: "Закрыть просмотр" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("клик по рамочке выбирает, отправляются только выбранные", async () => {
    vi.mocked(apiFetch).mockResolvedValueOnce(ok("picture-2"));
    const user = await withTwo();
    const frame = screen.getByRole("button", { name: "Выбрать картинку 2" });
    expect(frame).toHaveAttribute("aria-pressed", "false");
    await user.click(frame);
    expect(frame).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByRole("dialog")).toBeNull();

    await user.click(
      screen.getByRole("button", { name: "Опубликовать в «Каждый день»: 1" }),
    );
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent("Опубликовано 1 из 1"),
    );
    const calls = vi.mocked(apiFetch).mock.calls;
    expect(calls).toHaveLength(1);
    expect(((calls[0][1]?.body as FormData).get("file") as File).name).toBe(
      "b.jpg",
    );
  });
});
