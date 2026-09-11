import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { LibraryEntryFileDto } from "@vedamatch/shared";
import { EntryFiles } from "./entry-files";
import { uploadBookFile } from "./book-file-upload";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("./book-file-upload", async (importOriginal) => {
  const original = await importOriginal<typeof import("./book-file-upload")>();
  return {
    ...original,
    uploadBookFile: vi.fn().mockResolvedValue(undefined),
    deleteBookFile: vi.fn().mockResolvedValue(undefined),
  };
});

const file: LibraryEntryFileDto = {
  id: "file-1",
  name: "Бхагавад-гита как она есть.pdf",
  format: "pdf",
  sizeBytes: 2.4 * 1024 * 1024,
  url: "https://s3.example/get?sig=1",
  createdAt: "2026-09-11T10:00:00.000Z",
};

describe("EntryFiles", () => {
  it("читатель видит файл со ссылкой, форматом и размером", () => {
    render(
      <EntryFiles locale="ru" entryId="e1" files={[file]} canEdit={false} />,
    );

    expect(
      screen.getByRole("link", { name: /Бхагавад-гита как она есть\.pdf/ }),
    ).toHaveAttribute("href", file.url);
    expect(screen.getByText("PDF · 2,4 МБ")).toBeInTheDocument();
    // Заливки и снятия у читателя нет.
    expect(screen.queryByText("Прикрепить файл")).toBeNull();
    expect(screen.queryByRole("button", { name: /Убрать файл/ })).toBeNull();
  });

  it("без файлов и без права их добавлять секции нет", () => {
    const { container } = render(
      <EntryFiles locale="ru" entryId="e1" files={[]} canEdit={false} />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("автору предлагает прикрепить файл и убрать имеющийся", () => {
    render(<EntryFiles locale="ru" entryId="e1" files={[file]} canEdit />);

    expect(screen.getByLabelText("Прикрепить файл")).toHaveAttribute(
      "accept",
      expect.stringContaining(".djvu"),
    );
    expect(
      screen.getByRole("button", {
        name: "Убрать файл: Бхагавад-гита как она есть.pdf",
      }),
    ).toBeInTheDocument();
  });

  it("не книгу отбивает до заливки и говорит почему", async () => {
    const user = userEvent.setup({ applyAccept: false });
    render(<EntryFiles locale="ru" entryId="e1" files={[]} canEdit />);

    await user.upload(
      screen.getByLabelText("Прикрепить файл"),
      new File(["x"], "photo.jpg", { type: "image/jpeg" }),
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      /Такой формат не принимаем/,
    );
    expect(uploadBookFile).not.toHaveBeenCalled();
  });

  it("книгу отдаёт на заливку", async () => {
    const user = userEvent.setup();
    render(<EntryFiles locale="ru" entryId="e1" files={[]} canEdit />);
    const book = new File(["%PDF"], "Гита.pdf", { type: "application/pdf" });

    await user.upload(screen.getByLabelText("Прикрепить файл"), book);

    expect(uploadBookFile).toHaveBeenCalledWith(
      "e1",
      book,
      expect.any(Function),
    );
  });
});
