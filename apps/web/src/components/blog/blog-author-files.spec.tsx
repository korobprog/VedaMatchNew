import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { BlogAuthorFileDto } from "@vedamatch/shared";
import { AuthorFileError, uploadAuthorFile } from "@/lib/blog-author-files";
import { BlogAuthorFiles } from "./blog-author-files";

const deleteAuthorFile = vi.fn();
vi.mock("@/lib/blog-author-files", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/blog-author-files")
  >("@/lib/blog-author-files");
  return {
    ...actual,
    deleteAuthorFile: (id: string) => deleteAuthorFile(id) as unknown,
    uploadAuthorFile: vi.fn(),
  };
});

function file(
  id: string,
  kind: BlogAuthorFileDto["kind"],
  name: string,
): BlogAuthorFileDto {
  const format = name.split(".").pop() as BlogAuthorFileDto["format"];
  return {
    id,
    name,
    format,
    kind,
    sizeBytes: 2 * 1024 * 1024,
    url: `https://files.test/${id}`,
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}

const LIST = [
  file("a", "audio", "lecture.mp3"),
  file("v", "video", "kirtan.mp4"),
  file("d", "document", "book.pdf"),
];

/* VED-686, часть 2: файлы на личной странице. */
describe("BlogAuthorFiles", () => {
  it("пустой блок чужой страницы не показывается", () => {
    const { container } = render(<BlogAuthorFiles initial={[]} mine={false} />);
    expect(container.innerHTML).toBe("");
  });

  it("гость видит аудио, видео и документ своими элементами", () => {
    const { container } = render(
      <BlogAuthorFiles initial={LIST} mine={false} />,
    );
    expect(screen.getByRole("heading", { name: "Файлы" })).toBeTruthy();
    expect(container.querySelector("audio")?.getAttribute("src")).toBe(
      "https://files.test/a",
    );
    expect(container.querySelector("video")?.getAttribute("src")).toBe(
      "https://files.test/v",
    );
    const link = screen.getByRole("link", { name: "Открыть" });
    expect(link.getAttribute("href")).toBe("https://files.test/d");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(screen.queryByRole("button", { name: "Добавить файл" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Удалить/ })).toBeNull();
  });

  it("фильтр оставляет один вид", () => {
    render(<BlogAuthorFiles initial={LIST} mine={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Видео" }));
    expect(screen.queryByText("lecture.mp3")).toBeNull();
    expect(screen.getByText("kirtan.mp4")).toBeTruthy();
  });

  it("хозяин видит кнопку добавления", () => {
    render(<BlogAuthorFiles initial={[]} mine />);
    expect(screen.getByRole("button", { name: "Добавить файл" })).toBeTruthy();
  });

  it("удаление зовёт API и убирает файл", async () => {
    deleteAuthorFile.mockResolvedValue(undefined);
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<BlogAuthorFiles initial={LIST} mine />);
    fireEvent.click(screen.getByRole("button", { name: "Удалить book.pdf" }));
    await waitFor(() => expect(screen.queryByText("book.pdf")).toBeNull());
    expect(deleteAuthorFile).toHaveBeenCalledWith("d");
  });
});

/* VED-684: обрыв заливки на личной странице — «Повторить» и ожидание. */
describe("BlogAuthorFiles: обрыв заливки", () => {
  const interrupted =
    "Загрузка прервалась — телефон приостановил страницу или пропала связь.";

  function pick(name: string) {
    fireEvent.change(screen.getByTestId("author-file-input"), {
      target: { files: [new File(["x"], name, { type: "audio/mpeg" })] },
    });
  }

  it("упавший файл получает «Повторить» под ошибкой, и он доливает файл", async () => {
    const upload = vi.mocked(uploadAuthorFile);
    upload.mockReset();
    upload.mockRejectedValueOnce(new AuthorFileError("upload_interrupted"));
    upload.mockResolvedValueOnce(file("new", "audio", "lecture.mp3"));

    render(<BlogAuthorFiles initial={[]} mine />);
    pick("lecture.mp3");

    expect(await screen.findByText(`lecture.mp3: ${interrupted}`)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Повторить" }));

    await waitFor(() =>
      expect(screen.queryByText(`lecture.mp3: ${interrupted}`)).toBeNull(),
    );
    expect(upload).toHaveBeenCalledTimes(2);
  });

  it("отказ до заливки «Повторить» не предлагает", async () => {
    const upload = vi.mocked(uploadAuthorFile);
    upload.mockReset();

    render(<BlogAuthorFiles initial={[]} mine />);
    fireEvent.change(screen.getByTestId("author-file-input"), {
      target: { files: [new File(["x"], "notes.txt.exe")] },
    });

    expect(
      await screen.findByText(/notes\.txt\.exe: Такой формат не принимаем/),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Повторить" })).toBeNull();
    expect(upload).not.toHaveBeenCalled();
  });

  it("пока страница скрыта, показывает ожидание, а не ошибку", async () => {
    const upload = vi.mocked(uploadAuthorFile);
    upload.mockReset();
    upload.mockImplementation((_file, _onProgress, options) => {
      options?.onWaiting?.(true);
      return new Promise(() => {});
    });

    render(<BlogAuthorFiles initial={[]} mine />);
    pick("lecture.mp3");

    expect(
      await screen.findByText(/Ждём возвращения в приложение/),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Повторить" })).toBeNull();
  });
});
