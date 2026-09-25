import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildSpokenPost,
  getBlogPausedId,
  getBlogSpeakingId,
  pauseBlogSpeech,
  resumeBlogSpeech,
  speakBlogPost,
  speakButtonAction,
  speechChunks,
  spokenLanguage,
  stopBlogSpeech,
} from "./blog-speech";

describe("озвучка поста (VED-476)", () => {
  it("читает заголовок и текст, ссылки — словом", () => {
    expect(
      buildSpokenPost({
        title: "Экадаши",
        text: "Подробнее:  https://vcalendar.ru\n\nХаре Кришна",
      }),
    ).toBe("Экадаши. Подробнее: ссылка Харе Кришна");
    expect(buildSpokenPost({ title: null, text: "  " })).toBe("");
  });

  it("язык по буквам", () => {
    expect(spokenLanguage("Харе Кришна")).toBe("ru-RU");
    expect(spokenLanguage("kṛṣṇa")).toBe("en-US");
  });

  it("длинный текст — куски по фразам не длиннее предела", () => {
    const text = Array.from(
      { length: 30 },
      (_, at) => `Фраза номер ${at}.`,
    ).join(" ");
    const chunks = speechChunks(text, 60);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.length <= 60)).toBe(true);
    expect(chunks.join(" ")).toBe(text);
  });

  it("фраза длиннее предела режется по словам", () => {
    const text = "слово ".repeat(50).trim();
    const chunks = speechChunks(text, 40);
    expect(chunks.every((chunk) => chunk.length <= 40)).toBe(true);
    expect(chunks.join(" ")).toBe(text);
  });
});

describe("кнопка озвучки на панели (VED-514)", () => {
  it("читает → пауза → продолжить", () => {
    expect(speakButtonAction({ speaking: false, paused: false })).toBe("start");
    expect(speakButtonAction({ speaking: true, paused: false })).toBe("pause");
    expect(speakButtonAction({ speaking: false, paused: true })).toBe("resume");
  });
});

describe("пауза и продолжение с того же места (VED-514)", () => {
  class FakeUtterance {
    lang = "";
    onstart: (() => void) | null = null;
    onend: (() => void) | null = null;
    onerror: (() => void) | null = null;
    constructor(public text: string) {}
  }
  const spoken: FakeUtterance[] = [];

  function install() {
    spoken.length = 0;
    vi.stubGlobal("SpeechSynthesisUtterance", FakeUtterance);
    Object.defineProperty(window, "speechSynthesis", {
      configurable: true,
      value: {
        speak: (utterance: FakeUtterance) => spoken.push(utterance),
        cancel: () => undefined,
      },
    });
    Object.defineProperty(window, "SpeechSynthesisUtterance", {
      configurable: true,
      value: FakeUtterance,
    });
  }

  afterEach(() => {
    stopBlogSpeech();
    vi.unstubAllGlobals();
  });

  it("на паузе помнит кусок и продолжает с него", () => {
    install();
    const text = Array.from(
      { length: 30 },
      (_, at) => `Фраза номер ${at} про Кришну.`,
    ).join(" ");
    expect(speakBlogPost("p1", text)).toBe(true);
    const all = spoken.length;
    expect(all).toBeGreaterThan(2);
    expect(getBlogSpeakingId()).toBe("p1");

    // Дочитали до второго куска — пауза.
    spoken[1].onstart?.();
    pauseBlogSpeech();
    expect(getBlogSpeakingId()).toBeNull();
    expect(getBlogPausedId()).toBe("p1");
    // Отменённые куски на паузу не влияют.
    spoken[2].onerror?.();
    expect(getBlogPausedId()).toBe("p1");

    spoken.length = 0;
    expect(resumeBlogSpeech()).toBe(true);
    expect(getBlogSpeakingId()).toBe("p1");
    expect(getBlogPausedId()).toBeNull();
    // Продолжение — со второго куска, а не сначала.
    expect(spoken.length).toBe(all - 1);
  });
});
