import { describe, expect, it } from "vitest";
import { hasForeignModal } from "./modal-watch";

function dom(html: string) {
  const root = document.createElement("div");
  root.innerHTML = html;
  return root;
}

describe("hasForeignModal (VED-499)", () => {
  it("окно задачи поверх страницы — да", () => {
    expect(
      hasForeignModal(dom('<div role="dialog" aria-modal="true"></div>')),
    ).toBe(true);
  });

  it("свои окна плеера не в счёт", () => {
    expect(
      hasForeignModal(
        dom('<div data-music-player><div aria-modal="true"></div></div>'),
      ),
    ).toBe(false);
  });

  it("окон нет или они не модальные — нет", () => {
    expect(
      hasForeignModal(dom('<div role="dialog" aria-modal="false"></div>')),
    ).toBe(false);
    expect(hasForeignModal(dom("<main></main>"))).toBe(false);
  });
});
