import { afterEach, describe, expect, it, vi } from "vitest";
import { copyText } from "./copy-text";

function setClipboard(value: unknown) {
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value,
  });
}

function setExecCommand(impl: ((command: string) => boolean) | undefined) {
  Object.defineProperty(document, "execCommand", {
    configurable: true,
    writable: true,
    value: impl,
  });
}

afterEach(() => {
  setClipboard(undefined);
  setExecCommand(undefined);
  document.body.innerHTML = "";
});

describe("copyText", () => {
  it("пишет в буфер через Clipboard API, когда он открыт", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const execCommand = vi.fn(() => true);
    setClipboard({ writeText });
    setExecCommand(execCommand);

    await expect(copyText("Харе Кришна")).resolves.toBe(true);

    expect(writeText).toHaveBeenCalledWith("Харе Кришна");
    expect(execCommand).not.toHaveBeenCalled();
  });

  // Встроенный браузер отказал в записи (NotAllowedError) — раньше кнопка
  // на этом молча останавливалась.
  it("при отказе Clipboard API копирует выделением", async () => {
    setClipboard({
      writeText: vi
        .fn()
        .mockRejectedValue(new DOMException("denied", "NotAllowedError")),
    });
    let selected = "";
    const execCommand = vi.fn((command: string) => {
      const field = document.activeElement as HTMLTextAreaElement;
      selected = field.value.slice(field.selectionStart, field.selectionEnd);
      return command === "copy";
    });
    setExecCommand(execCommand);

    await expect(copyText("https://vedamatch.ru/i/abc")).resolves.toBe(true);

    expect(execCommand).toHaveBeenCalledWith("copy");
    expect(selected).toBe("https://vedamatch.ru/i/abc");
    // Служебное поле за собой не оставляем.
    expect(document.querySelector("textarea")).toBeNull();
  });

  it("без Clipboard API сразу копирует выделением", async () => {
    setClipboard(undefined);
    const execCommand = vi.fn(() => true);
    setExecCommand(execCommand);

    await expect(copyText("текст")).resolves.toBe(true);
    expect(execCommand).toHaveBeenCalledWith("copy");
  });

  it("не вышло ни так, ни так — честно говорит false и не бросает", async () => {
    setClipboard({ writeText: vi.fn().mockRejectedValue(new Error("no")) });
    setExecCommand(() => {
      throw new Error("not supported");
    });

    await expect(copyText("текст")).resolves.toBe(false);
    expect(document.querySelector("textarea")).toBeNull();
  });

  it("без обоих способов — false", async () => {
    setClipboard(undefined);
    setExecCommand(undefined);

    await expect(copyText("текст")).resolves.toBe(false);
  });

  it("возвращает фокус туда, где он был", async () => {
    setClipboard(undefined);
    setExecCommand(() => true);
    const button = document.createElement("button");
    document.body.appendChild(button);
    button.focus();

    await copyText("текст");

    expect(document.activeElement).toBe(button);
  });
});
