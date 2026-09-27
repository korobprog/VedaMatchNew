import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildSpokenEntry,
  getEntryPausedId,
  getEntrySpeakingId,
  pauseEntrySpeech,
  resumeEntrySpeech,
  speakButtonAction,
  speakEntry,
  speechChunks,
  stopEntrySpeech,
  stripUrls,
} from "./entry-speech";

describe("озвучка материала (VED-515)", () => {
  it("читает заголовок и основной текст, без ссылок (VED-550)", () => {
    expect(
      buildSpokenEntry({
        title: "Пурушоттама-врата",
        description: "Даршан, 2007",
        body: "Во время врата:\n\nсм. https://sampradaya.ru",
      }),
    ).toBe("Пурушоттама-врата. Во время врата: см.");
    // Основного текста нет — описание, но не адрес.
    expect(
      buildSpokenEntry({
        title: "Лекция",
        description: "Запись лекции youtube.com/watch?v=1",
        body: null,
      }),
    ).toBe("Лекция. Запись лекции");
    expect(
      buildSpokenEntry({ title: "Ссылка", description: "https://x.org" }),
    ).toBe("Ссылка");
    expect(buildSpokenEntry({ title: " ", description: null })).toBe("");
  });

  it("длинная катха — куски не длиннее предела", () => {
    const text = Array.from({ length: 40 }, (_, at) => `Стих ${at}.`).join(" ");
    const chunks = speechChunks(text, 50);
    expect(chunks.every((chunk) => chunk.length <= 50)).toBe(true);
    expect(chunks.join(" ")).toBe(text);
  });
});

describe("ссылки не читаются (VED-550)", () => {
  it("вырезает адреса и не трогает стихи", () => {
    expect(stripUrls("См. https://a.ru/x, а также site.ru/y.")).toBe(
      "См., а также.",
    );
    expect(stripUrls("Шримад-Бхагаватам 1.2.6, т. е.")).toBe(
      "Шримад-Бхагаватам 1.2.6, т. е.",
    );
  });
});

describe("пауза вместо стоп (VED-549)", () => {
  class FakeUtterance {
    lang = "";
    onstart: (() => void) | null = null;
    onend: (() => void) | null = null;
    onerror: (() => void) | null = null;
    constructor(public text: string) {}
  }
  const spoken: FakeUtterance[] = [];

  afterEach(() => {
    stopEntrySpeech();
    vi.unstubAllGlobals();
  });

  it("читает → пауза → продолжить", () => {
    expect(speakButtonAction({ speaking: false, paused: false })).toBe("start");
    expect(speakButtonAction({ speaking: true, paused: false })).toBe("pause");
    expect(speakButtonAction({ speaking: false, paused: true })).toBe("resume");
  });

  it("на паузе помнит фразу и продолжает с неё", () => {
    spoken.length = 0;
    vi.stubGlobal("SpeechSynthesisUtterance", FakeUtterance);
    vi.stubGlobal("speechSynthesis", {
      speak: (utterance: FakeUtterance) => spoken.push(utterance),
      cancel: () => undefined,
    });
    const text = Array.from(
      { length: 30 },
      (_, at) => `Стих номер ${at} о преданности.`,
    ).join(" ");
    expect(speakEntry("e1", text)).toBe(true);
    const all = spoken.length;
    expect(all).toBeGreaterThan(2);

    spoken[1].onstart?.();
    pauseEntrySpeech();
    expect(getEntrySpeakingId()).toBeNull();
    expect(getEntryPausedId()).toBe("e1");

    spoken.length = 0;
    expect(resumeEntrySpeech()).toBe(true);
    expect(getEntrySpeakingId()).toBe("e1");
    expect(getEntryPausedId()).toBeNull();
    expect(spoken.length).toBe(all - 1);
  });
});
