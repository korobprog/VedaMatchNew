import { beforeEach, describe, expect, it } from "vitest";
import {
  clearCapturedInstallPrompt,
  installPromptCaptureScript,
  installPromptGlobalKey,
  readCapturedInstallPrompt,
} from "./prompt-capture";

describe("install prompt capture", () => {
  beforeEach(() => {
    clearCapturedInstallPrompt();
  });

  it("stores an event that fires before React hydrates", () => {
    // Скрипт грузится стратегией beforeInteractive, поэтому проверяем его
    // ровно так, как он выполняется в браузере — как строку.
    new Function(installPromptCaptureScript)();

    const event = new Event("beforeinstallprompt", { cancelable: true });
    window.dispatchEvent(event);

    expect(readCapturedInstallPrompt()).toBe(event);
    expect(event.defaultPrevented).toBe(true);
  });

  it("reports nothing when the event never fired", () => {
    expect(readCapturedInstallPrompt()).toBeNull();
  });

  it("uses a namespaced global so it cannot collide with page scripts", () => {
    expect(installPromptGlobalKey).toMatch(/^__vedamatch/);
  });
});
