import { describe, expect, it } from "vitest";
import {
  chapterHref,
  filterShelf,
  firstChapterSlug,
  latestProgress,
  moveDockItem,
  parseDockOrder,
  recentProgress,
  shelfHeading,
  shelfSubtitle,
  readerPreferencesOf,
  SHELF_READER_DEFAULTS,
  stepFontSize,
  searchShelf,
  searchSnippet,
  shelfBookmarks,
} from "./shelf";

/* VED-662: полка Библиотеки. */
const prabhupada = "А. Ч. Бхактиведанта Свами Прабхупада";
const books = [
  {
    slug: "bhagavad-gita",
    title: "Бхагавад-гита как она есть",
    author: prabhupada,
    audienceStages: [],
    lineages: ["iskcon"],
  },
  {
    slug: "chaitanya-charitamrita",
    title: "Шри Чайтанья-чаритамрита",
    author: prabhupada,
    audienceStages: ["devotee"],
    lineages: ["iskcon"],
  },
  {
    slug: "beyond-birth-death",
    title: "По ту сторону рождения и смерти",
    author: prabhupada,
    audienceStages: ["seeker", "practitioner", "yogi"],
    lineages: ["iskcon"],
  },
  // Старый пакет без разметки — виден всем.
  { slug: "unknown", title: "Новая книга", author: null },
];

describe("filterShelf", () => {
  it("без выбора — все книги", () => {
    expect(filterShelf(books, { stages: [], lineages: [] })).toHaveLength(4);
  });

  it("«Кто я» прячет чужие ступени, книги для всех остаются", () => {
    const slugs = filterShelf(books, { stages: ["seeker"], lineages: [] }).map(
      (b) => b.slug,
    );
    expect(slugs).toEqual(["bhagavad-gita", "beyond-birth-death", "unknown"]);
  });

  it("линия — из разметки; книга без линии видна всем", () => {
    const slugs = filterShelf(books, {
      stages: [],
      lineages: ["sri_chaitanya_saraswat_math"],
    }).map((b) => b.slug);
    expect(slugs).toEqual(["unknown"]);
    expect(
      filterShelf(books, { stages: [], lineages: ["iskcon"] }),
    ).toHaveLength(4);
  });
});

describe("searchShelf", () => {
  it("ищет по названию и автору без регистра", () => {
    expect(searchShelf(books, "гита").map((b) => b.slug)).toEqual([
      "bhagavad-gita",
    ]);
    expect(searchShelf(books, "ПРАБХУПАДА")).toHaveLength(3);
    expect(searchShelf(books, "  ")).toHaveLength(4);
  });
});

describe("главы", () => {
  it("первая — по порядку, а не по месту в списке", () => {
    expect(
      firstChapterSlug({
        chapters: [
          { slug: "b", title: "B", order: 2, file: "" },
          { slug: "a", title: "A", order: 1, file: "" },
        ],
      }),
    ).toBe("a");
    expect(firstChapterSlug({ chapters: [] })).toBeNull();
  });

  it("адрес главы экранирует slug", () => {
    expect(chapterHref("bg", "2 1")).toBe("/vedabase/books/bg/2%201");
  });
});

describe("latestProgress", () => {
  const at = (bookSlug: string, lastReadAt: string, percentage = 40) => ({
    payload: {
      bookSlug,
      locator: { bookSlug, chapterSlug: "c2", unitId: "u" },
      percentage,
      lastReadAt,
    },
  });

  it("берёт самую свежую запись и округляет процент", () => {
    expect(
      latestProgress([
        at("bhagavad-gita", "2026-09-01T10:00:00.000Z"),
        at("isopanishad", "2026-09-20T10:00:00.000Z", 33.6),
      ]),
    ).toEqual({
      bookSlug: "isopanishad",
      chapterSlug: "c2",
      percentage: 34,
      lastReadAt: "2026-09-20T10:00:00.000Z",
    });
  });

  it("битые записи пропускает; пусто — null", () => {
    expect(
      latestProgress([{ payload: null }, { payload: { percentage: 5 } }]),
    ).toBeNull();
  });
});

describe("shelfBookmarks", () => {
  const catalog = [
    {
      slug: "bhagavad-gita",
      title: "Бхагавад-гита",
      chapters: [{ slug: "c2", title: "Глава 2", order: 2, file: "" }],
    },
  ];
  const mark = (
    id: string,
    bookSlug: string,
    extra: Record<string, unknown> = {},
  ) => ({
    id,
    payload: {
      bookSlug,
      locator: { bookSlug, chapterSlug: "c2", unitId: "u" },
      label: null,
      deletedAt: null,
      ...extra,
    },
  });

  it("живые закладки с названиями книги и главы", () => {
    expect(
      shelfBookmarks([mark("1", "bhagavad-gita", { label: "2.47" })], catalog),
    ).toEqual([
      {
        id: "1",
        bookSlug: "bhagavad-gita",
        bookTitle: "Бхагавад-гита",
        chapterSlug: "c2",
        chapterTitle: "Глава 2",
        label: "2.47",
      },
    ]);
  });

  it("удалённые и закладки пропавших книг не видны", () => {
    expect(
      shelfBookmarks(
        [
          mark("1", "bhagavad-gita", { deletedAt: "2026-09-01" }),
          mark("2", "gone"),
        ],
        catalog,
      ),
    ).toEqual([]);
  });
});

describe("настройки читалки с полки", () => {
  it("битая запись — умолчания читалки", () => {
    expect(readerPreferencesOf(undefined)).toEqual(SHELF_READER_DEFAULTS);
    expect(
      readerPreferencesOf({ theme: "neon", fontSize: 18, lineWidth: "medium" }),
    ).toEqual(SHELF_READER_DEFAULTS);
  });

  it("живая запись сохраняется как есть", () => {
    const saved = { theme: "sepia", fontSize: 22, lineWidth: "wide" };
    expect(readerPreferencesOf(saved)).toEqual(saved);
  });

  it("размер шрифта шагает по 2 и не выходит за пределы", () => {
    expect(stepFontSize(18, 1)).toBe(20);
    expect(stepFontSize(26, 1)).toBe(26);
    expect(stepFontSize(14, -1)).toBe(14);
  });
});

describe("searchSnippet", () => {
  it("окно вокруг совпадения, с многоточиями по краям", () => {
    const text = `${"а ".repeat(100)}карма-йога это действие ${"б ".repeat(100)}`;
    const snippet = searchSnippet(text, "карма", 10);
    expect(snippet.startsWith("…")).toBe(true);
    expect(snippet.endsWith("…")).toBe(true);
    expect(snippet).toContain("карма-йога");
  });

  it("находит слово в другой форме по основе", () => {
    expect(
      searchSnippet("Преданность — высшая дхарма", "преданности", 20),
    ).toContain("Преданность");
  });

  it("нет совпадения — начало текста", () => {
    expect(searchSnippet("Коротко", "zzz")).toBe("Коротко");
  });
});

describe("recentProgress", () => {
  const at = (bookSlug: string, lastReadAt: string) => ({
    payload: {
      bookSlug,
      locator: { bookSlug, chapterSlug: "c1", unitId: "u" },
      percentage: 10,
      lastReadAt,
    },
  });

  it("книги по свежести чтения", () => {
    expect(
      recentProgress([
        at("a", "2026-09-01T00:00:00.000Z"),
        { payload: "мусор" },
        at("b", "2026-09-20T00:00:00.000Z"),
      ]).map((item) => item.bookSlug),
    ).toEqual(["b", "a"]);
  });
});

describe("подписи полки (VED-676, VED-682)", () => {
  it("преданному — архив ведической литературы, остальным — саморазвитие", () => {
    expect(shelfSubtitle("devotee")).toMatch(/ведической/);
    expect(shelfSubtitle(null)).toMatch(/ведической/);
    expect(shelfSubtitle("seeker")).toBe("Архив книг для саморазвития");
  });

  it("заголовок с именем автора, если все книги его", () => {
    const prabhupada = { author: "А. Ч. Бхактиведанта Свами Прабхупада" };
    expect(shelfHeading([prabhupada, prabhupada])).toMatch(/Прабхупады/);
    expect(shelfHeading([prabhupada, { author: null }])).toBe("Книги");
    expect(shelfHeading([])).toBe("Книги");
  });
});

describe("порядок кнопок нижней панели (VED-677)", () => {
  it("сохранённый порядок, недостающие — в конец, мусор — прочь", () => {
    expect(
      parseDockOrder(JSON.stringify(["settings", "nope", "search", "search"])),
    ).toEqual(["settings", "search", "bookmarks", "filters"]);
    expect(parseDockOrder("{oops")).toEqual([
      "bookmarks",
      "search",
      "filters",
      "settings",
    ]);
  });

  it("сдвиг на шаг, за край — без изменений", () => {
    const order = parseDockOrder(null);
    expect(moveDockItem(order, "search", -1)).toEqual([
      "search",
      "bookmarks",
      "filters",
      "settings",
    ]);
    expect(moveDockItem(order, "bookmarks", -1)).toEqual(order);
  });
});
