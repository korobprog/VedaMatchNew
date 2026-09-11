import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
      "/motivation?post=picture-1&category=shastra",
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
