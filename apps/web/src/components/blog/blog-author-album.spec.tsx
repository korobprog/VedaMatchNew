import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { BlogAlbumPhotoDto } from "@vedamatch/shared";
import { uploadAlbumPhotos } from "@/lib/blog-album";
import { BlogAuthorAlbum } from "./blog-author-album";

const deleteAlbumPhoto = vi.fn();
const updateAlbumCaption = vi.fn();
vi.mock("@/lib/blog-album", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/blog-album")>(
      "@/lib/blog-album",
    );
  return {
    ...actual,
    deleteAlbumPhoto: (id: string) => deleteAlbumPhoto(id) as unknown,
    updateAlbumCaption: (id: string, caption: string) =>
      updateAlbumCaption(id, caption) as unknown,
    uploadAlbumPhotos: vi.fn(),
  };
});

function photo(id: string, caption = ""): BlogAlbumPhotoDto {
  return {
    id,
    url: `https://img.test/${id}.jpg`,
    width: 100,
    height: 100,
    caption,
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}

const LIST = [photo("a"), photo("b", "Киртан"), photo("c")];

beforeEach(() => {
  deleteAlbumPhoto.mockReset();
  updateAlbumCaption.mockReset();
});

/* VED-686, часть 3: фотоальбом на личной странице. */
describe("BlogAuthorAlbum", () => {
  it("пустой альбом чужой страницы не показывается", () => {
    const { container } = render(<BlogAuthorAlbum initial={[]} mine={false} />);
    expect(container.innerHTML).toBe("");
  });

  it("сетка показывает фото с подписями и запасным alt", () => {
    render(<BlogAuthorAlbum initial={LIST} mine={false} />);
    expect(screen.getByRole("heading", { name: "Фотоальбом" })).toBeTruthy();
    expect(screen.getAllByRole("img")).toHaveLength(3);
    expect(screen.getByAltText("Киртан")).toBeTruthy();
    expect(screen.getByAltText("Фото 1")).toBeTruthy();
  });

  it("просмотр показывает счётчик, «Следующее» двигает", () => {
    render(<BlogAuthorAlbum initial={LIST} mine={false} />);
    fireEvent.click(screen.getByAltText("Фото 1"));
    expect(screen.getByText("1 из 3")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Следующее фото" }));
    expect(screen.getByText("2 из 3")).toBeTruthy();
    fireEvent.keyDown(screen.getByRole("dialog", { hidden: true }), {
      key: "ArrowRight",
    });
    expect(screen.getByText("3 из 3")).toBeTruthy();
  });

  it("хозяин удаляет фото, и оно исчезает", async () => {
    deleteAlbumPhoto.mockResolvedValue(undefined);
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<BlogAuthorAlbum initial={LIST} mine />);
    fireEvent.click(screen.getByAltText("Киртан"));
    fireEvent.click(screen.getByRole("button", { name: "Удалить фото" }));
    await waitFor(() => expect(deleteAlbumPhoto).toHaveBeenCalledWith("b"));
    await waitFor(() => expect(screen.queryByAltText("Киртан")).toBeNull());
  });

  it("сохранение подписи зовёт API", async () => {
    updateAlbumCaption.mockResolvedValue(photo("a", "Новая"));
    render(<BlogAuthorAlbum initial={LIST} mine />);
    fireEvent.click(screen.getByAltText("Фото 1"));
    fireEvent.change(screen.getByLabelText("Подпись"), {
      target: { value: "Новая" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));
    await waitFor(() =>
      expect(updateAlbumCaption).toHaveBeenCalledWith("a", "Новая"),
    );
  });
});

/* VED-684: обрыв заливки в альбоме — «Повторить» и ожидание. */
describe("BlogAuthorAlbum: обрыв заливки", () => {
  function pick(name: string) {
    fireEvent.change(screen.getByTestId("album-photo-input"), {
      target: { files: [new File(["x"], name, { type: "image/jpeg" })] },
    });
  }

  it("снимки, не долившиеся из-за связи, получают «Повторить»", async () => {
    const upload = vi.mocked(uploadAlbumPhotos);
    upload.mockReset();
    upload.mockResolvedValueOnce({
      photos: [],
      failed: [{ name: "a.jpg", reason: "network" }],
    });
    upload.mockResolvedValueOnce({ photos: [photo("a")], failed: [] });

    render(<BlogAuthorAlbum initial={[]} mine />);
    pick("a.jpg");

    expect(
      await screen.findByText("a.jpg: Нет связи. Попробуйте ещё раз."),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Повторить" }));

    await waitFor(() =>
      expect(screen.queryByText(/a\.jpg: Нет связи/)).toBeNull(),
    );
    expect(upload).toHaveBeenCalledTimes(2);
    expect(screen.getByAltText("Фото 1")).toBeTruthy();
  });

  it("отказ сервера «Повторить» не предлагает", async () => {
    const upload = vi.mocked(uploadAlbumPhotos);
    upload.mockReset();
    upload.mockResolvedValue({
      photos: [],
      failed: [{ name: "a.jpg", reason: "file_too_large" }],
    });

    render(<BlogAuthorAlbum initial={[]} mine />);
    pick("a.jpg");

    expect(await screen.findByText(/a\.jpg: /)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Повторить" })).toBeNull();
  });

  it("пока страница скрыта, показывает ожидание, а не ошибку", async () => {
    const upload = vi.mocked(uploadAlbumPhotos);
    upload.mockReset();
    upload.mockImplementation((_files, options) => {
      options?.onWaiting?.(true);
      return new Promise(() => {});
    });

    render(<BlogAuthorAlbum initial={[]} mine />);
    pick("a.jpg");

    expect(
      await screen.findByText(/Ждём возвращения в приложение/),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Повторить" })).toBeNull();
  });
});
