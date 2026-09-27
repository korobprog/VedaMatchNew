import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildSpokenLibraryEntry,
  buildSpokenPost,
  libraryEntryIdOf,
  resolveSpokenPostText,
  stripUrls,
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
  it("читает заголовок и текст, ссылки не читает (VED-550)", () => {
    expect(
      buildSpokenPost({
        title: "Экадаши",
        text: "Подробнее:  https://vcalendar.ru\n\nХаре Кришна",
      }),
    ).toBe("Экадаши. Подробнее: Харе Кришна");
    // Пост из одного заголовка и ссылки — читается заголовок.
    expect(
      buildSpokenPost({ title: "Катха о Гите", text: "sampradaya.ru/katha/1" }),
    ).toBe("Катха о Гите");
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

describe("ссылки голосом не читаются (VED-550)", () => {
  it("вырезает http, www и голые домены", () => {
    expect(stripUrls("См. https://a.ru/x?y=1 и www.b.com/путь.")).toBe(
      "См. и.",
    );
    expect(stripUrls("Сайт vedamatch.ru/library/entry/42 — там всё")).toBe(
      "Сайт — там всё",
    );
    expect(stripUrls("Портал сайт.рф (http://x.org)")).toBe("Портал");
  });

  it("не трогает стихи, сокращения и обычный текст", () => {
    expect(stripUrls("Бхагавад-гита 2.13, т. е. душа")).toBe(
      "Бхагавад-гита 2.13, т. е. душа",
    );
    expect(stripUrls("Конец.Начало")).toBe("Конец.Начало");
    expect(stripUrls("kṛṣṇa is God")).toBe("kṛṣṇa is God");
  });
});

describe("пост из Образования читается текстом материала (VED-550)", () => {
  const fromLibrary = {
    title: "Катха о Гите",
    text: "https://vedamatch.ru/library/entry/abc",
    link: { url: "/library/entry/abc" },
  };

  it("id материала — из ссылки поста, путь или полный адрес", () => {
    expect(libraryEntryIdOf(fromLibrary)).toBe("abc");
    expect(
      libraryEntryIdOf({
        link: { url: "https://vedamatch.com/library/entry/x%201" },
      }),
    ).toBe("x 1");
    expect(libraryEntryIdOf({ link: { url: "/music/track/1" } })).toBeNull();
    expect(libraryEntryIdOf({ link: null })).toBeNull();
    expect(libraryEntryIdOf({})).toBeNull();
  });

  it("у материала — заголовок и основной текст, без ссылок", () => {
    expect(
      buildSpokenLibraryEntry({
        titleRu: "Катха",
        descriptionRu: "Краткое описание",
        body: "Текст катхи. Подробнее на https://site.ru",
      }),
    ).toBe("Катха. Текст катхи. Подробнее на");
    // Основного текста нет — описание.
    expect(
      buildSpokenLibraryEntry({
        titleRu: null,
        titleEn: "Talk",
        descriptionRu: null,
        descriptionEn: "About the soul",
      }),
    ).toBe("Talk. About the soul");
  });

  it("выбирает источник: материал, а при неудаче — сам пост", async () => {
    const load = vi.fn(async () => ({ titleRu: "Катха", body: "О душе." }));
    await expect(resolveSpokenPostText(fromLibrary, load)).resolves.toBe(
      "Катха. О душе.",
    );
    expect(load).toHaveBeenCalledWith("abc");

    await expect(
      resolveSpokenPostText(fromLibrary, async () => null),
    ).resolves.toBe("Катха о Гите");
    await expect(
      resolveSpokenPostText(fromLibrary, async () => {
        throw new Error("offline");
      }),
    ).resolves.toBe("Катха о Гите");

    const plain = vi.fn();
    await expect(
      resolveSpokenPostText({ title: "Пост", text: "Текст" }, plain),
    ).resolves.toBe("Пост. Текст");
    expect(plain).not.toHaveBeenCalled();
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
