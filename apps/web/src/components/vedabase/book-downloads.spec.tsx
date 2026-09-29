import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BookDownloads } from "./book-downloads";

const fetchFiles = vi.fn();
vi.mock("@/lib/vedabase-client-api", () => ({
  fetchVedabaseBookFiles: (slug: string) => fetchFiles(slug),
}));

/* VED-662: «Скачать книгу» в читалке. */
describe("BookDownloads", () => {
  it("показывает файлы книги со ссылками", async () => {
    fetchFiles.mockResolvedValue([
      {
        id: "f1",
        name: "Бхагавад-гита.epub",
        format: "epub",
        sizeBytes: 2.4 * 1024 * 1024,
        url: "https://media.example/signed",
        createdAt: "2026-09-29T00:00:00.000Z",
      },
    ]);
    render(<BookDownloads bookSlug="bhagavad-gita" />);
    const link = await screen.findByRole("link", {
      name: /Бхагавад-гита\.epub/,
    });
    expect(link).toHaveAttribute("href", "https://media.example/signed");
    expect(link).toHaveTextContent("EPUB · 2,4 МБ");
    expect(fetchFiles).toHaveBeenCalledWith("bhagavad-gita");
  });

  it("без файлов — объясняет, что делать", async () => {
    fetchFiles.mockResolvedValue([]);
    render(<BookDownloads bookSlug="x" />);
    expect(
      await screen.findByText(/Файлов для скачивания/),
    ).toBeInTheDocument();
  });

  it("без сети — не молчит", async () => {
    fetchFiles.mockRejectedValue(new Error("offline"));
    render(<BookDownloads bookSlug="x" />);
    expect(await screen.findByText(/нужна связь/)).toBeInTheDocument();
  });
});
