import { act, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ShelfSheet } from "./shelf-sheet";

type Sheet = "contents" | "downloads" | null;

function Harness({ onChange }: { onChange(sheet: Sheet): void }) {
  const [sheet, setSheet] = useState<Sheet>("contents");
  const set = (next: Sheet) => {
    setSheet(next);
    onChange(next);
  };
  return (
    <>
      <ShelfSheet
        open={sheet === "contents"}
        title="Содержание"
        onClose={() => set(null)}
      >
        <button type="button" onClick={() => set("downloads")}>
          Скачать книгу
        </button>
      </ShelfSheet>
      <ShelfSheet
        open={sheet === "downloads"}
        title="Файлы"
        onClose={() => set(null)}
      >
        <p>Файлы книги</p>
      </ShelfSheet>
    </>
  );
}

const dialog = (name: string) =>
  document.querySelector<HTMLDialogElement>(`dialog[aria-label="${name}"]`)!;

describe("ShelfSheet", () => {
  const original = {
    showModal: Object.getOwnPropertyDescriptor(
      HTMLDialogElement.prototype,
      "showModal",
    ),
    close: Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, "close"),
  };

  beforeEach(() => {
    vi.useFakeTimers();
    // Как в браузере: `close()` снимает `open` сразу, а событие `close`
    // приходит отдельной задачей, уже после перерисовки.
    Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
      configurable: true,
      value(this: HTMLDialogElement) {
        this.setAttribute("open", "");
      },
    });
    Object.defineProperty(HTMLDialogElement.prototype, "close", {
      configurable: true,
      value(this: HTMLDialogElement) {
        if (!this.hasAttribute("open")) return;
        this.removeAttribute("open");
        setTimeout(() => this.dispatchEvent(new Event("close")), 0);
      },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    for (const name of ["showModal", "close"] as const) {
      const descriptor = original[name];
      if (descriptor)
        Object.defineProperty(HTMLDialogElement.prototype, name, descriptor);
      else
        delete (HTMLDialogElement.prototype as Partial<HTMLDialogElement>)[name];
    }
  });

  it("переход из шторки в шторку не закрывает вторую", () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    expect(dialog("Содержание")).toHaveAttribute("open");

    fireEvent.click(screen.getByRole("button", { name: "Скачать книгу" }));
    act(() => {
      vi.runAllTimers();
    });

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenLastCalledWith("downloads");
    expect(dialog("Файлы")).toHaveAttribute("open");
    expect(dialog("Содержание")).not.toHaveAttribute("open");
  });

  it("Esc закрывает открытую шторку", () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);

    // По Esc браузер сам закрывает диалог и шлёт `close`.
    act(() => {
      dialog("Содержание").dispatchEvent(new Event("close"));
    });

    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  it("крестик закрывает открытую шторку", () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);

    fireEvent.click(
      dialog("Содержание").querySelector('button[aria-label="Закрыть"]')!,
    );
    act(() => {
      vi.runAllTimers();
    });

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenLastCalledWith(null);
  });
});
