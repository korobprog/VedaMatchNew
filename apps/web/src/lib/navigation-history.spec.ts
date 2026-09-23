import { describe, expect, it } from "vitest";
import {
  NAVIGATION_HISTORY_LIMIT,
  groupNavigationHistory,
  normalizeHistoryUrl,
  parseNavigationHistory,
  recordNavigationVisit,
  serializeNavigationHistory,
  type NavigationHistoryEntry,
} from "./navigation-history";
import { portalLocation } from "./portal-location";

/** История из адресов в порядке посещения (первый — самый старый). */
function visited(...urls: string[]): NavigationHistoryEntry[] {
  return urls.reduce<NavigationHistoryEntry[]>(
    (list, url, index) => recordNavigationVisit(list, url, index + 1),
    [],
  );
}

const locate = (url: string) => portalLocation(url);

describe("normalizeHistoryUrl", () => {
  it("срезает якорь и оставляет query", () => {
    expect(normalizeHistoryUrl("/work/agenda?day=1#top")).toBe(
      "/work/agenda?day=1",
    );
  });

  it("чужие адреса и промежуточные экраны не записываются", () => {
    expect(normalizeHistoryUrl("https://evil.example/")).toBeNull();
    expect(normalizeHistoryUrl("//evil.example/")).toBeNull();
    expect(normalizeHistoryUrl("/login?returnTo=/work")).toBeNull();
    expect(normalizeHistoryUrl("/offline")).toBeNull();
  });
});

describe("recordNavigationVisit", () => {
  it("новое посещение встаёт первым", () => {
    expect(visited("/work", "/music").map((entry) => entry.url)).toEqual([
      "/music",
      "/work",
    ]);
  });

  it("перезагрузка той же страницы повтора не даёт", () => {
    const list = visited("/work/agenda", "/work/agenda");
    expect(list).toEqual([{ url: "/work/agenda", at: 2 }]);
  });

  it("смена одного query обновляет последнюю запись, а не плодит новые", () => {
    const list = visited("/search", "/search?q=г", "/search?q=гита");
    expect(list).toEqual([{ url: "/search?q=гита", at: 3 }]);
  });

  it("возврат на ту же страницу через другую — это новое посещение", () => {
    expect(visited("/work", "/music", "/work")).toHaveLength(3);
  });

  it("держит не больше предела, выбрасывая самые старые", () => {
    const urls = Array.from(
      { length: NAVIGATION_HISTORY_LIMIT + 5 },
      (_, index) => `/notices/${index}`,
    );
    const list = visited(...urls);
    expect(list).toHaveLength(NAVIGATION_HISTORY_LIMIT);
    expect(list[0]!.url).toBe(`/notices/${NAVIGATION_HISTORY_LIMIT + 4}`);
    expect(list.at(-1)!.url).toBe("/notices/5");
  });

  it("незаписываемый адрес оставляет историю как была", () => {
    const list = visited("/work");
    expect(recordNavigationVisit(list, "/login", 9)).toEqual(list);
  });
});

describe("parseNavigationHistory", () => {
  it("читает то, что записал serialize", () => {
    const list = visited("/work", "/music/playlists");
    expect(parseNavigationHistory(serializeNavigationHistory(list))).toEqual(
      list,
    );
  });

  it("мусор и чужие адреса — мимо, без падения", () => {
    expect(parseNavigationHistory(null)).toEqual([]);
    expect(parseNavigationHistory("{не json")).toEqual([]);
    expect(parseNavigationHistory('{"items":"x"}')).toEqual([]);
    expect(
      parseNavigationHistory(
        JSON.stringify({
          v: 1,
          items: [
            { url: "https://evil.example", at: 1 },
            { url: "/work", at: "вчера" },
            null,
            { url: "/music", at: 2 },
          ],
        }),
      ),
    ).toEqual([{ url: "/music", at: 2 }]);
  });
});

describe("groupNavigationHistory", () => {
  it("ступени одного сервиса подряд — одна строка, сервис назван один раз", () => {
    const groups = groupNavigationHistory(
      visited("/work", "/work/boards/1", "/work/agenda", "/work/planner"),
      locate,
    );
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({
      key: "work",
      root: "Работа",
      rootUrl: "/work",
      steps: [
        { label: "Доска", url: "/work/boards/1" },
        { label: "Повестка", url: "/work/agenda" },
        { label: "Планировщик", url: "/work/planner" },
      ],
    });
  });

  it("строки идут от новых к старым, ступени внутри — по порядку пути", () => {
    const groups = groupNavigationHistory(
      visited("/music/playlists", "/music/albums/7", "/blog", "/blog/authors"),
      locate,
    );
    expect(groups.map((group) => group.root)).toEqual(["Блог", "Музыка"]);
    expect(groups[1]!.steps.map((step) => step.label)).toEqual([
      "Плейлисты",
      "Альбом",
    ]);
  });

  it("ушёл в другой сервис и вернулся — новая строка, а не дописка к старой", () => {
    const groups = groupNavigationHistory(
      visited("/work/agenda", "/music", "/work/planner"),
      locate,
    );
    expect(groups.map((group) => group.key)).toEqual(["work", "music", "work"]);
  });

  it("в сам сервис не заходили — название ведёт в его корень", () => {
    const [group] = groupNavigationHistory(visited("/market/cart"), locate);
    expect(group!.rootUrl).toBe("/market");
  });

  it("заход в сам сервис звеном не становится, а становится адресом названия", () => {
    const [group] = groupNavigationHistory(
      visited("/motivation?tab=cards", "/motivation/collections"),
      locate,
    );
    expect(group!.rootUrl).toBe("/motivation?tab=cards");
    expect(group!.steps.map((step) => step.label)).toEqual(["Картинки"]);
  });

  it("страница с идентификатором вместо ступени — тоже адрес названия", () => {
    const [group] = groupNavigationHistory(
      visited("/chat/8f21aa", "/chat/people"),
      locate,
    );
    expect(group!.rootUrl).toBe("/chat/8f21aa");
    expect(group!.steps).toEqual([{ label: "Люди", url: "/chat/people" }]);
  });

  it("одинаковые ступени подряд сливаются в одну — ссылкой на позднюю", () => {
    const [group] = groupNavigationHistory(
      visited("/market/listing/1", "/market/listing/2", "/market/cart"),
      locate,
    );
    expect(group!.steps).toEqual([
      { label: "Товар", url: "/market/listing/2" },
      { label: "Корзина", url: "/market/cart" },
    ]);
  });

  it("имя сервиса берётся из каталога через locate", () => {
    const [group] = groupNavigationHistory(visited("/union/likes"), (url) =>
      portalLocation(url, (slug, fallback) =>
        slug === "union" ? "Союз" : fallback,
      ),
    );
    expect(group!.root).toBe("Союз");
  });

  it("главная — своя строка без ступеней", () => {
    const groups = groupNavigationHistory(visited("/", "/work"), locate);
    expect(groups[1]).toMatchObject({
      key: "",
      root: "Главная",
      rootUrl: "/",
      steps: [],
    });
  });

  it("пустая история — пустой список", () => {
    expect(groupNavigationHistory([], locate)).toEqual([]);
  });
});
