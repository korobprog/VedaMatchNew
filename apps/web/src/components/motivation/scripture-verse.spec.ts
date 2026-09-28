import { describe, expect, it } from "vitest";
import {
  findVerseUnit,
  htmlToText,
  parseScriptureVerse,
  verseSpanOf,
} from "./scripture-verse";

describe("parseScriptureVerse", () => {
  it("читает стих Гиты из подписи и локатора", () => {
    expect(parseScriptureVerse("Бхагавад-гита", "2.47")).toEqual({
      bookSlug: "bhagavad-gita",
      chapterSlug: "2",
      verse: 47,
    });
    expect(parseScriptureVerse("Бхагавад-гита как она есть", "18:66")).toEqual({
      bookSlug: "bhagavad-gita",
      chapterSlug: "18",
      verse: 66,
    });
  });

  it("понимает словесный локатор, сокращение и повтор названия в локаторе", () => {
    expect(
      parseScriptureVerse("Бхагавад-гита", "Глава 2, текст 14")?.verse,
    ).toBe(14);
    expect(parseScriptureVerse(null, "БГ 9.27")).toMatchObject({
      chapterSlug: "9",
      verse: 27,
    });
    expect(parseScriptureVerse("Bhagavad-gītā", "4.7")).toMatchObject({
      bookSlug: "bhagavad-gita",
      chapterSlug: "4",
    });
    expect(parseScriptureVerse("", "Бхагавад-гита 2.13")?.verse).toBe(13);
  });

  it("берёт первый стих диапазона", () => {
    expect(parseScriptureVerse("Бхагавад-гита", "2.47-48")?.verse).toBe(47);
    expect(parseScriptureVerse("Бхагавад-гита", "1.16–18")?.verse).toBe(16);
  });

  it("не угадывает стих, когда номера нет или он вне книги", () => {
    expect(parseScriptureVerse("Бхагавад-гита", "Глава 6")).toBeNull();
    expect(parseScriptureVerse("Бхагавад-гита", "")).toBeNull();
    expect(parseScriptureVerse("Бхагавад-гита", "19.1")).toBeNull();
    expect(parseScriptureVerse("Бхагавад-гита", "0.5")).toBeNull();
    expect(parseScriptureVerse("Нектар преданности", "2.47")).toBeNull();
    expect(parseScriptureVerse("Письмо ученику", "1972")).toBeNull();
    expect(parseScriptureVerse(null, null)).toBeNull();
  });

  it("не принимает «бг» внутри слова", () => {
    expect(parseScriptureVerse("Обгон", "2.47")).toBeNull();
  });

  it("Бхагаватам: песнь и глава — в слаге главы", () => {
    expect(parseScriptureVerse("Шримад-Бхагаватам", "1.2.6")).toEqual({
      bookSlug: "srimad-bhagavatam",
      chapterSlug: "1-2",
      verse: 6,
    });
    expect(
      parseScriptureVerse("Шримад-Бхагаватам 1.2.12", null)?.chapterSlug,
    ).toBe("1-2");
    expect(parseScriptureVerse("ШБ", "10.14.8")).toMatchObject({
      chapterSlug: "10-14",
      verse: 8,
    });
    expect(parseScriptureVerse("Шримад-Бхагаватам", "1.2")).toBeNull();
    expect(parseScriptureVerse("Шримад-Бхагаватам", "13.1.1")).toBeNull();
  });

  it("Чайтанья-чаритамрита: лила словом или числом", () => {
    expect(
      parseScriptureVerse("Чайтанья-чаритамрита", "Мадхья 20.108"),
    ).toEqual({
      bookSlug: "chaitanya-charitamrita",
      chapterSlug: "2-20",
      verse: 108,
    });
    expect(
      parseScriptureVerse("Чайтанья-чаритамрита", "Ади-лила 7.5")?.chapterSlug,
    ).toBe("1-7");
    expect(parseScriptureVerse("ЧЧ", "Антья 20.12")?.chapterSlug).toBe("3-20");
    expect(
      parseScriptureVerse("Чайтанья-чаритамрита", "3.20.21")?.chapterSlug,
    ).toBe("3-20");
    expect(parseScriptureVerse("Чайтанья-чаритамрита", "20.108")).toBeNull();
    expect(parseScriptureVerse("Чайтанья-чаритамрита", "4.1.1")).toBeNull();
  });
});

describe("verseSpanOf", () => {
  it("берёт номер из адреса источника", () => {
    expect(
      verseSpanOf({ sourceUrl: "https://vedabase.ru/bhagavad-gita/2/47/" }),
    ).toEqual({
      from: 47,
      to: 47,
    });
    expect(
      verseSpanOf({ sourceUrl: "https://vedabase.ru/bhagavad-gita/1/16-18/" }),
    ).toEqual({
      from: 16,
      to: 18,
    });
  });

  it("без номера в адресе — хвост заголовка", () => {
    expect(
      verseSpanOf({
        sourceUrl: "https://vedabase.ru/bg/intro/",
        title: "Текст 47",
      }),
    ).toEqual({
      from: 47,
      to: 47,
    });
    expect(verseSpanOf({ title: "Тексты 16–18" })).toEqual({
      from: 16,
      to: 18,
    });
    expect(verseSpanOf({ title: "БГ 2.47" })).toEqual({ from: 47, to: 47 });
    expect(verseSpanOf({ title: "Введение" })).toBeNull();
    expect(verseSpanOf({ sourceUrl: "не адрес" })).toBeNull();
  });
});

describe("findVerseUnit", () => {
  const verse = (n: string, extra: Record<string, unknown> = {}) => ({
    id: `u${n}`,
    title: `Текст ${n}`,
    sourceUrl: `https://vedabase.ru/bhagavad-gita/1/${n}/`,
    originalHtml: `<p>देव ${n}</p>`,
    ...extra,
  });

  it("находит стих и стих внутри диапазона", () => {
    const payload = { units: [verse("1"), verse("16-18"), verse("19")] };
    expect(findVerseUnit(payload, 1)?.title).toBe("Текст 1");
    expect(findVerseUnit(payload, 17)?.title).toBe("Текст 16-18");
    expect(findVerseUnit(payload, 20)).toBeNull();
  });

  it("не отдаёт стих без санскритских частей", () => {
    const payload = { units: [verse("1", { originalHtml: "  " })] };
    expect(findVerseUnit(payload, 1)).toBeNull();
  });

  it("переживает payload чужой формы", () => {
    expect(findVerseUnit(null, 1)).toBeNull();
    expect(findVerseUnit({}, 1)).toBeNull();
    expect(findVerseUnit({ units: "x" }, 1)).toBeNull();
    expect(findVerseUnit({ units: [null, 3, verse("1")] }, 1)?.title).toBe(
      "Текст 1",
    );
  });
});

describe("htmlToText", () => {
  it("строки стиха — переносы, разметка и сущности — прочь", () => {
    expect(
      htmlToText(
        "<p>дхарма-кшетре<br>куру-кшетре</p><p>самавета&nbsp;&mdash; <i>йуйутсавах̣</i></p>",
      ),
    ).toBe("дхарма-кшетре\nкуру-кшетре\nсамавета — йуйутсавах̣");
  });

  it("не пропускает теги наружу", () => {
    expect(
      htmlToText('<script>alert(1)</script><img src=x onerror="x">стих'),
    ).toBe("стих");
  });
});
