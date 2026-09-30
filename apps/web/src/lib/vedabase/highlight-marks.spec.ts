import { describe, expect, it } from "vitest";
import { applyColor, applyMark, clearMarks } from "./highlight-marks";

function block(html: string): HTMLElement {
  const element = document.createElement("div");
  element.innerHTML = html;
  return element;
}

/* VED-662: выделения видны в тексте. */
describe("applyMark", () => {
  it("оборачивает диапазон внутри одного узла", () => {
    const root = block("<p>Карма-йога — это действие</p>");
    applyMark(root, { id: "a", start: 0, end: 10, kind: "highlight" });
    expect(root.innerHTML).toBe(
      '<p><mark data-vb-mark="a" data-kind="highlight" class="reader-mark rounded-sm">Карма-йога</mark> — это действие</p>',
    );
  });

  it("диапазон через тег — по куску в каждом узле, текст не меняется", () => {
    const root = block("<p>один <i>два</i> три</p>");
    applyMark(root, { id: "b", start: 2, end: 11, kind: "note" });
    const marks = root.querySelectorAll("mark");
    expect([...marks].map((mark) => mark.textContent)).toEqual([
      "ин ",
      "два",
      " тр",
    ]);
    expect(root.textContent).toBe("один два три");
  });

  it("за краем текста обрезается, пустой диапазон ничего не делает", () => {
    const root = block("<p>коротко</p>");
    applyMark(root, { id: "c", start: 3, end: 99, kind: "highlight" });
    expect(root.querySelector("mark")?.textContent).toBe("отко");
    applyMark(root, { id: "d", start: 50, end: 60, kind: "highlight" });
    expect(root.querySelectorAll("mark")).toHaveLength(1);
  });
});

describe("clearMarks", () => {
  it("возвращает исходную разметку", () => {
    const original = "<p>один <i>два</i> три</p>";
    const root = block(original);
    applyMark(root, { id: "b", start: 2, end: 11, kind: "note" });
    clearMarks(root);
    expect(root.innerHTML).toBe(original);
  });
});

describe("applyColor", () => {
  it("красит отрезок, clearMarks снимает и раскраску", () => {
    const root = block("<p>ман-мана бхава</p>");
    applyColor(root, { start: 0, end: 8, color: "blue" });
    expect(root.querySelector("span.reader-color-blue")?.textContent).toBe(
      "ман-мана",
    );
    clearMarks(root);
    expect(root.innerHTML).toBe("<p>ман-мана бхава</p>");
  });
});
