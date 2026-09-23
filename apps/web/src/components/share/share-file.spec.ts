import { describe, expect, it, vi } from "vitest";
import {
  SAVE_OPTIONS,
  canShareFiles,
  formatFileSize,
  isTelegramWebView,
  qualityFileName,
  qualityFilePath,
  saveOptionState,
  shareButtonState,
  shareFileName,
  unsupportedShareMessage,
} from "./share-file";

describe("shareFileName (VED-156)", () => {
  it("расширение совпадает с содержимым файла", () => {
    expect(shareFileName("/m/daily-2026-09-14/story", "image/jpeg")).toBe(
      "vedamatch-daily-2026-09-14.jpg",
    );
    expect(shareFileName("/m/daily-2026-09-14/story", "image/webp")).toBe(
      "vedamatch-daily-2026-09-14.webp",
    );
    expect(
      shareFileName("/m/daily-2026-09-14/story", "image/png; charset=binary"),
    ).toBe("vedamatch-daily-2026-09-14.png");
  });

  it("имя — по слагу карточки, а не по слову story", () => {
    expect(
      shareFileName(
        "/m/picture-65263442-c158-456c-92c0-18e00a01bf52/story",
        "image/jpeg",
      ),
    ).toBe("vedamatch-picture-65263442-c158-456c-92c0-18e00a01bf52.jpg");
  });

  it("чужие символы и параметры в пути не попадают в имя", () => {
    expect(shareFileName("/m/Кришна 108?v=2", "image/jpeg")).toBe(
      "vedamatch-108.jpg",
    );
  });

  it("неизвестный тип — jpg, пустой путь — card", () => {
    expect(shareFileName("/", "application/octet-stream")).toBe(
      "vedamatch-card.jpg",
    );
  });
});

describe("canShareFiles", () => {
  const file = new File(["x"], "vedamatch-a.jpg", { type: "image/jpeg" });

  it("нет navigator.share — нельзя (встроенные окна приложений)", () => {
    expect(canShareFiles({} as Navigator, file)).toBe(false);
    expect(canShareFiles(undefined, file)).toBe(false);
  });

  it("canShare отказал файлам — нельзя", () => {
    const nav = { share: vi.fn(), canShare: vi.fn(() => false) };
    expect(canShareFiles(nav as never, file)).toBe(false);
    expect(nav.canShare).toHaveBeenCalledWith({ files: [file] });
  });

  it("canShare бросил — считаем, что нельзя", () => {
    const nav = {
      share: vi.fn(),
      canShare: vi.fn(() => {
        throw new TypeError("bad");
      }),
    };
    expect(canShareFiles(nav as never, file)).toBe(false);
  });

  it("Chrome на Android: share и canShare согласны — можно", () => {
    const nav = { share: vi.fn(), canShare: vi.fn(() => true) };
    expect(canShareFiles(nav as never, file)).toBe(true);
  });
});

describe("isTelegramWebView", () => {
  it("узнаёт встроенный браузер Telegram по агенту или мосту", () => {
    expect(isTelegramWebView("Mozilla/5.0 (Linux; Android 14) Telegram-Android/11.2.3")).toBe(true);
    expect(isTelegramWebView("Mozilla/5.0 Chrome/140", { TelegramWebviewProxy: {} })).toBe(true);
    expect(isTelegramWebView("Mozilla/5.0 (Linux; Android 14) Chrome/140 Mobile")).toBe(false);
  });
});

describe("shareButtonState (VED-156: индикатор ожидания)", () => {
  it("пока картинка готовится — крутится и говорит об этом", () => {
    expect(shareButtonState({ prepare: "loading", sharing: false })).toEqual({
      label: "Готовим картинку…",
      busy: true,
    });
  });

  it("после нажатия, пока открывается шторка, — тоже занято", () => {
    expect(shareButtonState({ prepare: "ready", sharing: true })).toEqual({
      label: "Открываем приложения…",
      busy: true,
    });
  });

  it("готово или не вышло заранее — обычная кнопка", () => {
    expect(shareButtonState({ prepare: "ready", sharing: false }).busy).toBe(false);
    expect(shareButtonState({ prepare: "failed", sharing: false }).busy).toBe(false);
  });
});

describe("unsupportedShareMessage", () => {
  it("в Telegram подсказывает, как выйти в Chrome", () => {
    expect(unsupportedShareMessage(true)).toContain("Открыть в браузере");
    expect(unsupportedShareMessage(false)).toContain("Сохранить картинку");
  });
});

/**
 * VED-156, дописка от 23.09: «Сделай 3 кнопки сохранить изображение в разном
 * качестве, чтобы когда нужно хорошее качество можно было его получить».
 */
describe("три качества «Сохранить картинку»", () => {
  const nbsp = "\u00a0";

  it("три варианта по возрастанию веса, у каждого — оценка", () => {
    expect(SAVE_OPTIONS.map((option) => option.quality)).toEqual([
      "light",
      "standard",
      "max",
    ]);
    for (const option of SAVE_OPTIONS) expect(option.estimate).toMatch(/МБ$/);
  });

  it("адрес: лёгкое — прежний, остальные — с параметром качества", () => {
    expect(qualityFilePath("/m/post/story", "light")).toBe("/m/post/story");
    expect(qualityFilePath("/m/post/story", "standard")).toBe("/m/post/story?q=standard");
    expect(qualityFilePath("/m/post/story?v=2", "max")).toBe("/m/post/story?v=2&q=max");
  });

  it("имя файла: у качеств разные, лёгкое — прежнее", () => {
    expect(qualityFileName("/m/reel-33e14d6e-mu376h10/story", "image/jpeg", "light")).toBe(
      "vedamatch-reel-33e14d6e-mu376h10.jpg",
    );
    expect(qualityFileName("/m/reel-33e14d6e-mu376h10/story", "image/jpeg", "standard")).toBe(
      "vedamatch-reel-33e14d6e-mu376h10-hq.jpg",
    );
    expect(qualityFileName("/m/reel-33e14d6e-mu376h10/story", "image/png", "max")).toBe(
      "vedamatch-reel-33e14d6e-mu376h10-max.png",
    );
  });

  it("вес по-русски, число не отрывается от единицы", () => {
    expect(formatFileSize(431_583)).toBe(`421${nbsp}КБ`);
    expect(formatFileSize(2_933_000)).toBe(`2,8${nbsp}МБ`);
    expect(formatFileSize(12_000_000)).toBe(`11${nbsp}МБ`);
    expect(formatFileSize(10)).toBe(`1${nbsp}КБ`);
  });

  it("кнопка: оценка → индикатор → отметка с точным весом", () => {
    const estimate = SAVE_OPTIONS[2]!.estimate;
    expect(saveOptionState({ phase: "idle", size: null, estimate })).toEqual({
      note: estimate,
      busy: false,
      saved: false,
    });
    expect(saveOptionState({ phase: "loading", size: null, estimate })).toEqual({
      note: "Готовим…",
      busy: true,
      saved: false,
    });
    expect(saveOptionState({ phase: "saved", size: 2_933_000, estimate })).toEqual({
      note: `✓ Сохранено · 2,8${nbsp}МБ`,
      busy: false,
      saved: true,
    });
    // Получили и отметка погасла — остаётся точный вес, а не оценка.
    expect(saveOptionState({ phase: "idle", size: 2_933_000, estimate }).note).toBe(
      `2,8${nbsp}МБ`,
    );
    expect(saveOptionState({ phase: "failed", size: null, estimate }).busy).toBe(false);
  });
});
