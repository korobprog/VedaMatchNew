import { existsSync } from "node:fs";
import { join } from "node:path";
import { createElement, type ImgHTMLAttributes } from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { VedaMatchMark } from "./vedamatch-mark";

vi.mock("next/image", () => ({
  default: (
    props: ImgHTMLAttributes<HTMLImageElement> & {
      fill?: boolean;
      priority?: boolean;
    },
  ) => {
    const { fill, priority, ...imageProps } = props;
    void fill;
    void priority;
    return createElement("img", imageProps);
  },
}));

const PUBLIC_DIR = join(__dirname, "..", "..", "..", "public");

describe("VedaMatchMark", () => {
  it("подписан для чтения с экрана — и ровно один раз", () => {
    render(<VedaMatchMark />);
    // Копий знака в разметке две, тёмная и светлая; подписана одна, иначе
    // скринридер прочитал бы «VedaMatch VedaMatch».
    expect(screen.getAllByRole("img", { name: "VedaMatch" })).toHaveLength(1);
  });

  /**
   * Обе версии лежат в разметке всегда, а видимую выбирает `dark:`. Проверка
   * держит именно это: если тёмная копия отвалится, знак не пропадёт — он
   * просто станет тёмно-синим на почти чёрном, и заметить это на светлой
   * машине разработчика нечем.
   */
  it("держит в разметке обе темы знака", () => {
    const { container } = render(<VedaMatchMark />);
    const images = [...container.querySelectorAll("img")];

    expect(images.map((image) => image.getAttribute("src"))).toEqual([
      "/brand/mark.png",
      "/brand/mark-dark.png",
    ]);
    expect(images[0].className).toContain("dark:hidden");
    expect(images[1].className).toContain("dark:block");
  });

  it("пробрасывает размер снаружи", () => {
    const { container } = render(<VedaMatchMark className="h-12 w-12" />);
    expect(container.firstElementChild?.className).toContain("h-12 w-12");
  });

  /**
   * Файлы собираются `scripts/generate-icons.mjs` и лежат в репозитории:
   * сборка их не создаёт. Пропавший файл ломается молча — вместо знака
   * пустое место, и ни одного исключения.
   */
  it("ссылается на файлы, которые лежат в public/", () => {
    for (const file of ["brand/mark.png", "brand/mark-dark.png"]) {
      expect(existsSync(join(PUBLIC_DIR, file)), file).toBe(true);
    }
  });
});
