import { readFileSync } from "node:fs";
import { join } from "node:path";
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
    // Скрипт грузится отдельным файлом из public/, поэтому проверяем его
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

  it("keeps public/pwa-install-prompt.js identical to the source constant", () => {
    // Файл в public/ — копия этой константы: layout подключает его обычным
    // <script async src>, потому что next/script со стратегией
    // beforeInteractive кладёт <script> в дерево компонентов, и React 19
    // ругается на это на каждой странице.
    //
    // Копия и оригинал обязаны совпадать: разъехавшись, они дадут перехват,
    // который работает в тестах и молчит в браузере.
    const file = readFileSync(
      join(process.cwd(), "public", "pwa-install-prompt.js"),
      "utf8",
    );
    expect(file.trim()).toBe(installPromptCaptureScript.trim());
  });
});
