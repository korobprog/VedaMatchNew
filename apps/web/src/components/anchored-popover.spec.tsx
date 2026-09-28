import { useCallback, useRef, useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { useDismissable } from "@/lib/use-dismissable";
import { AnchoredPopover } from "./anchored-popover";

function Menu() {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const close = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);
  useDismissable(panelRef, close, open, triggerRef);
  return (
    <div style={{ overflow: "hidden" }} data-testid="clip">
      <button ref={triggerRef} type="button" onClick={() => setOpen(!open)}>
        Линия
      </button>
      {open && (
        <AnchoredPopover
          anchorRef={triggerRef}
          panelRef={panelRef}
          role="group"
          aria-label="Меню"
        >
          <button type="button" aria-pressed={false}>
            Первый
          </button>
          <button type="button" aria-pressed>
            Выбранный
          </button>
          <button type="button" aria-pressed={false}>
            Последний
          </button>
        </AnchoredPopover>
      )}
      <button type="button">Снаружи</button>
    </div>
  );
}

const initialWidth = window.innerWidth;
afterEach(() => {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    value: initialWidth,
  });
});

describe("AnchoredPopover (VED-604)", () => {
  it("рисуется порталом в body — контейнер с overflow его не обрезает", async () => {
    render(<Menu />);
    await userEvent.click(screen.getByRole("button", { name: "Линия" }));
    const panel = screen.getByRole("group", { name: "Меню" });
    expect(screen.getByTestId("clip").contains(panel)).toBe(false);
    expect(panel.parentElement).toBe(document.body);
    expect(panel.className).toContain("fixed");
  });

  it("фокус — на выбранный пункт, Tab ходит по кругу внутри", async () => {
    render(<Menu />);
    await userEvent.click(screen.getByRole("button", { name: "Линия" }));
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Выбранный" }),
    );
    await userEvent.tab();
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Последний" }),
    );
    await userEvent.tab();
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Первый" }),
    );
    await userEvent.tab({ shift: true });
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Последний" }),
    );
  });

  it("Esc закрывает и возвращает фокус на кнопку", async () => {
    render(<Menu />);
    const trigger = screen.getByRole("button", { name: "Линия" });
    await userEvent.click(trigger);
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("group", { name: "Меню" })).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("клик вне закрывает", async () => {
    render(<Menu />);
    await userEvent.click(screen.getByRole("button", { name: "Линия" }));
    await userEvent.click(screen.getByRole("button", { name: "Снаружи" }));
    expect(screen.queryByRole("group", { name: "Меню" })).toBeNull();
  });

  it("на узком экране — нижний лист во всю ширину", async () => {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 390,
    });
    render(<Menu />);
    await userEvent.click(screen.getByRole("button", { name: "Линия" }));
    const panel = screen.getByRole("group", { name: "Меню" });
    expect(panel.dataset.placement).toBe("sheet");
    expect(panel.className).toContain("inset-x-0");
    expect(panel.className).toContain("bottom-0");
  });
});
