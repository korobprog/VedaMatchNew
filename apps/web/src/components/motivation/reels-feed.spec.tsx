import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MotivationPostDto } from "@vedamatch/shared";
import { ReelsFeed } from "./reels-feed";

// jsdom не знает IntersectionObserver; активный слайд в тестах не нужен.
class FakeObserver {
  observe() {}
  disconnect() {}
  unobserve() {}
}
vi.stubGlobal("IntersectionObserver", FakeObserver);

const post = (id: string, overrides: Partial<MotivationPostDto> = {}): MotivationPostDto => ({
  id,
  slug: id,
  contentDate: "2026-08-01",
  profileType: "user",
  audienceTrack: "universal",
  category: "daily",
  categoryTitle: "Каждый день",
  imageUrl: `https://cdn/${id}.webp`,
  storyImageUrl: "",
  videoUrl: "",
  videoHasSound: false,
  captionInImage: false,
  title: `Пост ${id}`,
  text: `Цитата ${id}\n\nПояснение ${id}`,
  storyText: "",
  imageText: "",
  attributionKind: "exact_quote",
  attributionSpeaker: "Кришна",
  attributionWork: "Бхагавад-гита",
  attributionLocator: "2.47",
  attributionSourceUrl: null,
  sourceVerified: true,
  publishedAt: "2026-08-01T00:00:00.000Z",
  isFavorite: false,
  isViewed: false,
  likeCount: 4,
  isLiked: false,
  origin: "editorial",
  author: null,
  explanationAuthor: null,
  explanationHidden: false,
  explanationReported: false,
  isOwn: false,
  library: null,
  feedTier: "unseen",
  ...overrides,
});

/** Строка подписи под картинкой: автор, источник, категория. */
function captionOf(slide: HTMLElement): HTMLElement {
  const caption = [...slide.querySelectorAll("p")].find((p) => p.textContent?.includes("📖"));
  if (!caption) throw new Error("подписи под картинкой нет");
  return caption;
}

/**
 * Доступные имена кнопки «текст на картинке». Держим их здесь, чтобы тест
 * читался про поведение, а не про строку, — и чтобы переименование ловилось
 * в одном месте вместе с отдельной проверкой ниже, что в имени нет «Скрыть».
 */
const TEXT_OFF = "Смотреть без текста — только у вас на экране";
const TEXT_ON = "Смотреть с текстом — вернуть цитату на картинку";

function fetchOk(body: unknown) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => body,
    text: async () => JSON.stringify(body),
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

beforeEach(() => {
  vi.restoreAllMocks();
  // Синтез речи подменяется в одном тесте на весь файл, и без сброса кнопка
  // «Озвучить» осталась бы видна там, где её быть не должно.
  vi.unstubAllGlobals();
  vi.stubGlobal("IntersectionObserver", FakeObserver);
});

describe("ReelsFeed", () => {
  it("renders a slide per post with quote, source and a divider before repeats", () => {
    fetchOk({});
    render(
      <ReelsFeed
        initial={{
          items: [post("a", { feedTier: "fresh" }), post("b"), post("c", { feedTier: "seen" })],
          nextCursor: null,
        }}
        tab="forYou"
        donation={null}
      />,
    );

    const feed = screen.getByRole("feed", { name: "Лента вдохновения" });
    const articles = within(feed).getAllByRole("article");
    expect(articles).toHaveLength(3);
    expect(within(articles[0]).getByText("Цитата a")).toBeInTheDocument();
    expect(captionOf(articles[0])).toHaveTextContent("Кришна · Бхагавад-гита · 2.47");
    // Разделитель стоит ровно перед первым повтором и после непросмотренного.
    const divider = within(feed).getByRole("region", { name: "Всё новое просмотрено" });
    expect(divider.compareDocumentPosition(articles[1]) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();
    expect(divider.compareDocumentPosition(articles[2]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(feed).getByRole("region", { name: "Конец ленты" })).toBeInTheDocument();
  });

  // VED-252: «Для вас» переименована в «Ленту», значок фильтра встал в тот
  // же ряд между «Открытки» и «Избранное», подписи у него нет.
  it("верхний ряд — пять пунктов, вкладка называется «Лента», у значка фильтра нет подписи", () => {
    fetchOk({});
    render(
      <ReelsFeed initial={{ items: [post("a")], nextCursor: null }} tab="forYou" donation={null} />,
    );

    const tabs = screen.getByRole("navigation", { name: "Вкладки ленты" });
    const labels = [...tabs.children].map((node) => node.textContent);
    expect(labels).toEqual(["Лента", "Открытки", "", "Избранное", "Мои"]);
    expect(within(tabs).queryByText("Для вас")).not.toBeInTheDocument();
    expect(within(tabs).queryByText("Автор и источник")).not.toBeInTheDocument();
    expect(
      within(tabs).getByRole("button", { name: "Фильтр по автору и источнику" }),
    ).toBeInTheDocument();
  });

  // VED-252, круг 2: у избранного фильтров нет — значок должен молча
  // исчезнуть из самого ряда `Tabs()` (не только у `FeedAttributionFilter`
  // в изоляции), оставляя ровно четыре пункта без дыры на его месте.
  it("на вкладке «Избранное» в ряду вкладок нет значка фильтра — четыре пункта", () => {
    fetchOk({});
    render(
      <ReelsFeed initial={{ items: [post("a")], nextCursor: null }} tab="saved" donation={null} />,
    );

    const tabs = screen.getByRole("navigation", { name: "Вкладки ленты" });
    const labels = [...tabs.children].map((node) => node.textContent);
    expect(labels).toEqual(["Лента", "Открытки", "Избранное", "Мои"]);
    expect(
      within(tabs).queryByRole("button", { name: /Фильтр по автору и источнику/ }),
    ).not.toBeInTheDocument();
  });

  // VED-135: на пустом тёмном экране разделителя — кнопки категорий вверху.
  // VED-432: лента раздела запоминает пост, провисевший на экране.
  it("запоминает место в ленте раздела, а в личной ленте — нет", async () => {
    vi.useFakeTimers();
    try {
      const fetchMock = fetchOk({ ok: true });
      const { unmount } = render(
        <ReelsFeed
          initial={{ items: [post("a"), post("b")], nextCursor: null }}
          tab="forYou"
          donation={null}
          category="filosofiya-2"
        />,
      );
      await vi.advanceTimersByTimeAsync(1600);
      const put = fetchMock.mock.calls.find(([url]) => String(url).endsWith("/motivation/feed-position"));
      expect(put).toBeDefined();
      expect(put![1]).toMatchObject({ method: "PUT" });
      expect(JSON.parse(put![1].body as string)).toEqual({
        post: "a",
        style: "art",
        category: "filosofiya-2",
      });
      unmount();

      const personal = fetchOk({ ok: true });
      render(
        <ReelsFeed
          initial={{ items: [post("a")], nextCursor: null }}
          tab="forYou"
          donation={null}
        />,
      );
      await vi.advanceTimersByTimeAsync(1600);
      expect(
        personal.mock.calls.some(([url]) => String(url).endsWith("/motivation/feed-position")),
      ).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("лента, открытая с места остановки, предлагает «С начала»", () => {
    fetchOk({});
    render(
      <ReelsFeed
        initial={{ items: [post("c"), post("d")], nextCursor: null, resumed: true }}
        tab="cards"
        donation={null}
        category="filosofiya-2"
      />,
    );
    expect(
      screen.getByRole("link", { name: "Лента открыта с места, где вы остановились. Открыть с начала" }),
    ).toHaveAttribute("href", "/motivation?tab=cards&category=filosofiya-2");
  });

  it("ставит кнопки категорий на разделитель и в конец ленты", () => {
    fetchOk({});
    render(
      <ReelsFeed
        initial={{
          items: [post("a", { feedTier: "fresh" }), post("c", { feedTier: "seen" })],
          nextCursor: null,
        }}
        tab="cards"
        donation={null}
        category="guru"
        categories={[
          { id: "1", slug: "guru", title: "Гуру", sortOrder: 1, isDefault: false, parentId: null, postCount: 4, feed: "both" as const, artCount: 4, cardsCount: 0 },
          { id: "2", slug: "acharyas", title: "Ачарьи", sortOrder: 2, isDefault: false, parentId: null, postCount: 2, feed: "both" as const, artCount: 2, cardsCount: 0 },
          { id: "3", slug: "empty", title: "Пустая", sortOrder: 3, isDefault: false, parentId: null, postCount: 0, feed: "both" as const, artCount: 0, cardsCount: 0 },
        ]}
      />,
    );

    const feed = screen.getByRole("feed", { name: "Лента вдохновения" });
    for (const name of ["Всё новое просмотрено", "Конец ленты"]) {
      const slide = within(feed).getByRole("region", { name });
      const nav = within(slide).getByRole("navigation", { name: "Выбор категории" });
      const links = within(nav).getAllByRole("link");
      expect(links.map((link) => link.textContent)).toEqual(["Все", "Гуру", "Ачарьи"]);
      expect(within(nav).getByRole("link", { name: "Все" })).toHaveAttribute("href", "/motivation?tab=cards");
      expect(within(nav).getByRole("link", { name: "Ачарьи" })).toHaveAttribute(
        "href",
        "/motivation?tab=cards&category=acharyas",
      );
      expect(within(nav).getByRole("link", { name: "Гуру" })).toHaveAttribute("aria-current", "page");
      // Кнопки стоят над текстом слайда, а не под ним.
      // В конце ленты раздела (VED-432) — «посмотрели все открытки раздела».
      const heading = within(slide).getByText(
        /Вы посмотрели всё новое|Вы посмотрели все открытки раздела «Гуру»/,
      );
      expect(nav.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
    // Лента раздела кончилась — «Начать сначала» ведёт в её начало, без resume.
    const end = within(feed).getByRole("region", { name: "Конец ленты" });
    expect(within(end).getByRole("link", { name: /Начать сначала/ })).toHaveAttribute(
      "href",
      "/motivation?tab=cards&category=guru",
    );
  });

  it("без непустых категорий кнопок нет", () => {
    fetchOk({});
    render(
      <ReelsFeed
        initial={{ items: [post("a", { feedTier: "seen" })], nextCursor: null }}
        tab="forYou"
        donation={null}
      />,
    );

    expect(screen.queryByRole("navigation", { name: "Выбор категории" })).not.toBeInTheDocument();
  });

  // VED-87: цитата уже напечатана на открытке — второй экземпляр поверх
  // закрыл бы первый. Набранный текст уходит в alt для скринридера.
  it("не рисует цитату поверх готовой открытки и отдаёт её текст в alt", () => {
    fetchOk({});
    render(
      <ReelsFeed
        initial={{
          items: [
            post("a", {
              captionInImage: true,
              text: "Кто видит меня везде",
              title: "Кто видит меня везде",
            }),
          ],
          nextCursor: null,
        }}
        tab="forYou"
        donation={null}
      />,
    );

    const slide = within(screen.getByRole("feed", { name: "Лента вдохновения" })).getAllByRole("article")[0];
    expect(within(slide).queryByText("Кто видит меня везде")).not.toBeInTheDocument();
    const picture = within(slide).getByRole("img", { name: "Кто видит меня везде" });
    expect(picture).toHaveClass("object-contain");
    // Подпись источника остаётся: кто автор, на картинке может не значиться.
    expect(captionOf(slide)).toHaveTextContent("Кришна · Бхагавад-гита · 2.47");
  });

  // VED-140: «Шримад-» оставалось в конце строки, «Бхагаватам» уезжало вниз.
  it("каждую графу подписи держит неразрывной, переносятся графы целиком", () => {
    fetchOk({});
    render(
      <ReelsFeed
        initial={{
          items: [
            post("a", {
              attributionSpeaker: "Шрила Шукадева Госвами",
              attributionWork: "Шримад-Бхагаватам 1.2.12",
              attributionLocator: null,
            }),
          ],
          nextCursor: null,
        }}
        tab="forYou"
        donation={null}
      />,
    );

    const slide = within(screen.getByRole("feed", { name: "Лента вдохновения" })).getAllByRole("article")[0];
    const caption = captionOf(slide);
    const fields = [...caption.children].map((field) => ({
      text: field.textContent?.replace(/\s+/g, " ").trim(),
      unbreakable: field.classList.contains("inline-block"),
    }));
    expect(fields).toEqual([
      { text: "VedaMatch ·", unbreakable: true },
      { text: "📖 Шрила Шукадева Госвами ·", unbreakable: true },
      { text: "Шримад-Бхагаватам 1.2.12 ·", unbreakable: true },
      { text: "📂 Каждый день", unbreakable: true },
    ]);
  });

  // VED-206: автор и книга в подписи включают фильтр, стих ведёт в источник.
  it("делает автора и книгу в подписи кнопками фильтра, а стих — ссылкой на источник", () => {
    fetchOk({});
    render(
      <ReelsFeed
        initial={{
          items: [
            post("a", { attributionSourceUrl: "https://vedabase.io/ru/library/bg/2/47/" }),
            post("b", { attributionLocator: null, attributionSourceUrl: "https://t.me/x/1" }),
          ],
          nextCursor: null,
        }}
        tab="cards"
        category="vedy"
        donation={null}
      />,
    );

    const [first, second] = within(screen.getByRole("feed", { name: "Лента вдохновения" })).getAllByRole(
      "article",
    );
    const work = within(captionOf(first)).getByRole("link", { name: "Только источник: Бхагавад-гита" });
    expect(Object.fromEntries(new URL(work.getAttribute("href")!, "https://x").searchParams)).toEqual({
      tab: "cards",
      category: "vedy",
      work: "Бхагавад-гита",
    });
    expect(within(captionOf(first)).getByRole("link", { name: "Только автор: Кришна" })).toBeInTheDocument();
    expect(within(captionOf(first)).getByRole("link", { name: "2.47" })).toHaveAttribute(
      "href",
      "https://vedabase.io/ru/library/bg/2/47/",
    );
    // Нет номера стиха — первоисточник не теряется, он за значком в конце.
    expect(within(captionOf(second)).getByRole("link", { name: /Первоисточник/ })).toHaveAttribute(
      "href",
      "https://t.me/x/1",
    );
  });

  // VED-249: постоянная пунктирная линия под каждой графой источника мешала
  // читать подпись — подчёркивание остаётся только при наведении мышью.
  it("не подчёркивает графы источника в состоянии покоя, только при наведении", () => {
    fetchOk({});
    render(
      <ReelsFeed
        initial={{ items: [post("a", { attributionSourceUrl: "https://vedabase.io/ru/library/bg/2/47/" })], nextCursor: null }}
        tab="cards"
        category="vedy"
        donation={null}
      />,
    );

    const caption = captionOf(
      within(screen.getByRole("feed", { name: "Лента вдохновения" })).getAllByRole("article")[0],
    );
    const work = within(caption).getByRole("link", { name: "Только источник: Бхагавад-гита" });
    const locator = within(caption).getByRole("link", { name: "2.47" });
    for (const link of [work, locator]) {
      const textSpan = link.querySelector("span");
      expect(textSpan?.className.split(" ")).not.toContain("underline");
      expect(textSpan?.className.split(" ")).not.toContain("decoration-dotted");
      expect(textSpan?.className.split(" ")).toContain("hover:underline");
    }
  });

  // VED-124: обычная картинка 2:3 растягивалась на весь экран 9:19,5 и теряла
  // треть ширины — у фигур по краям пропадали головы.
  it("обычную картинку показывает целиком, на размытой подложке", () => {
    fetchOk({});
    render(<ReelsFeed initial={{ items: [post("a")], nextCursor: null }} tab="forYou" donation={null} />);

    const slide = within(screen.getByRole("feed", { name: "Лента вдохновения" })).getAllByRole("article")[0];
    const pictures = [...slide.querySelectorAll("img")].filter(
      (img) => img.getAttribute("src") === "https://cdn/a.webp",
    );
    const frame = pictures.find((img) => img.getAttribute("aria-hidden") !== "true");
    const backdrop = pictures.find((img) => img.getAttribute("aria-hidden") === "true");

    expect(frame).toHaveClass("object-contain");
    expect(frame).not.toHaveClass("object-cover");
    expect(backdrop).toHaveClass("object-cover", "blur-2xl");
    // Цитата набрана поверх слайда — в alt её не дублируем.
    expect(frame).toHaveAttribute("alt", "");
  });

  it("отправка своим живёт внутри «Поделиться», а не соседней кнопкой", () => {
    fetchOk({});
    render(<ReelsFeed initial={{ items: [post("a")], nextCursor: null }} tab="forYou" donation={null} />);

    expect(
      screen.queryByRole("link", { name: "Отправить своим в портале" }),
    ).not.toBeInTheDocument();

    const share = screen.getByRole("link", { name: "Поделиться афоризмом" });
    const href = share.getAttribute("href") ?? "";
    expect(href.startsWith("/share?")).toBe(true);
    // Экран «Поделиться» собирает из этих полей кнопку «Своим в портале»:
    // без них объединённая кнопка потеряла бы дорогу внутрь портала.
    const query = new URLSearchParams(href.slice(href.indexOf("?") + 1));
    expect(query.get("sourceService")).toBe("motivation");
    expect(query.get("sourceId")).toBe("a");
    expect(query.get("kind")).toBe("story");
    expect(query.get("title")).toContain("Цитата a");
    expect(query.get("subtitle")).toBe("Кришна · Бхагавад-гита · 2.47");
    expect(query.get("link")).toBe("/m/a");
    expect(query.get("file")).toBe("/m/a/story");
  });

  /**
   * VED-357: «Исключи любой дубляж текста при отображении рилса во время
   * пересылки». Источник уже стоит заголовком превью ссылки `/m/<slug>` —
   * его ставит `buildShareMeta()`. Значит, в тело сообщения он не идёт, и
   * экрану «Поделиться» об этом говорит сам адрес: чужих метатегов тот не
   * читает.
   */
  it("источник не уезжает в текст сообщения — он уже заголовок превью", () => {
    fetchOk({});
    render(<ReelsFeed initial={{ items: [post("a")], nextCursor: null }} tab="forYou" donation={null} />);

    const href = screen.getByRole("link", { name: "Поделиться афоризмом" }).getAttribute("href") ?? "";
    const query = new URLSearchParams(href.slice(href.indexOf("?") + 1));
    expect(query.get("subtitleInPreview")).toBe("1");
    // Сам источник из адреса не пропадает: он нужен карточке для чата и
    // подписью на экране «Поделиться» — там превью ссылки нет.
    expect(query.get("subtitle")).toBe("Кришна · Бхагавад-гита · 2.47");
  });

  it("открытка без набранного текста делится заголовком, а не пустотой (VED-205)", () => {
    // Экран /share без text уводит на главную — у открытки текст на картинке.
    fetchOk({});
    render(
      <ReelsFeed
        initial={{
          items: [post("card", { captionInImage: true, text: "", title: "Картинка из раздела «Каждый день»" })],
          nextCursor: null,
        }}
        tab="cards"
        donation={null}
      />,
    );

    const href = screen.getByRole("link", { name: "Поделиться афоризмом" }).getAttribute("href") ?? "";
    const query = new URLSearchParams(href.slice(href.indexOf("?") + 1));
    expect(query.get("text")).toBe("Картинка из раздела «Каждый день»");
    expect(query.get("title")).toBe("Картинка из раздела «Каждый день»");
  });

  it("нижний ряд слушается раскладки с устройства", () => {
    fetchOk({});
    // Своя раскладка: сначала «Поделиться», потом «Нравится»,
    // а «Сохранить» убрано вовсе.
    window.localStorage.setItem(
      "vedamatch:motivation-rail",
      JSON.stringify(["share", "like"]),
    );
    render(<ReelsFeed initial={{ items: [post("a")], nextCursor: null }} tab="forYou" donation={null} />);

    expect(
      screen.queryByRole("button", { name: "Сохранить в избранное" }),
    ).not.toBeInTheDocument();
    const share = screen.getByRole("link", { name: "Поделиться афоризмом" });
    const like = screen.getByRole("button", { name: "Нравится" });
    expect(
      share.compareDocumentPosition(like) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    window.localStorage.clear();
  });

  it("likes optimistically and settles on the server count", async () => {
    const fetchMock = fetchOk({ likeCount: 10, isLiked: true });
    const user = userEvent.setup();
    render(<ReelsFeed initial={{ items: [post("a")], nextCursor: null }} tab="forYou" donation={null} />);

    const like = screen.getByRole("button", { name: "Нравится" });
    await user.click(like);

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/motivation/posts/a/like"),
      expect.objectContaining({ method: "POST" }),
    );
    await waitFor(() => expect(screen.getByRole("button", { name: "Убрать лайк" })).toHaveAttribute("aria-pressed", "true"));
    expect(screen.getByText("10")).toBeInTheDocument();
  });

  it("rolls the like back when the request fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}), text: async () => "boom" }),
    );
    const user = userEvent.setup();
    render(<ReelsFeed initial={{ items: [post("a")], nextCursor: null }} tab="forYou" donation={null} />);

    await user.click(screen.getByRole("button", { name: "Нравится" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Нравится" })).toHaveAttribute("aria-pressed", "false"));
    expect(screen.getByText("4")).toBeInTheDocument();
  });

  it("shows the donate button on the end slide only when donations are enabled", () => {
    fetchOk({});
    const { rerender } = render(
      <ReelsFeed initial={{ items: [post("a")], nextCursor: null }} tab="forYou" donation={null} />,
    );
    expect(screen.queryByRole("button", { name: /Поддержать развитие/ })).not.toBeInTheDocument();

    rerender(
      <ReelsFeed
        initial={{ items: [post("a")], nextCursor: null }}
        tab="forYou"
        donation={{ enabled: true, text: "", requisites: [{ kind: "card", label: "Карта", value: "2200" }] }}
      />,
    );
    expect(screen.getByRole("button", { name: /Поддержать развитие/ })).toBeInTheDocument();
  });

  it("signs editorial posts with the service and sends the author's name to their profile", () => {
    fetchOk({});
    render(
      <ReelsFeed
        initial={{
          items: [
            post("a"),
            post("b", {
              origin: "user",
              author: { id: "u-radha", name: "Радха-деви" },
            }),
          ],
          nextCursor: null,
        }}
        tab="forYou"
        donation={null}
      />,
    );

    expect(screen.getByText("VedaMatch")).toBeInTheDocument();
    // Имя участника — ссылка в его профиль: у редакционной публикации
    // человека-автора нет, и ссылки там быть не должно.
    expect(screen.getByRole("link", { name: "Радха-деви" })).toHaveAttribute(
      "href",
      "/chat/people/users/u-radha",
    );
    expect(screen.queryByRole("link", { name: "VedaMatch" })).not.toBeInTheDocument();
  });

  it("keeps the folder while loading the next page of a category feed", async () => {
    const fetchMock = fetchOk({ items: [], nextCursor: null });
    // Наблюдатель, который сразу говорит «слайд на экране»: подгрузку
    // запускает именно активация, а в jsdom её иначе не случается.
    class EagerObserver {
      constructor(private readonly notify: (entries: unknown[]) => void) {}
      observe(node: Element) {
        this.notify([{ isIntersecting: true, intersectionRatio: 1, target: node }]);
      }
      disconnect() {}
      unobserve() {}
    }
    vi.stubGlobal("IntersectionObserver", EagerObserver);

    render(
      <ReelsFeed
        initial={{ items: [post("a")], nextCursor: "cursor-1" }}
        tab="forYou"
        donation={null}
        category="poslovitsy"
      />,
    );

    // Без слага вторая страница приехала бы из всей базы, и папка
    // «Пословицы» на третьем свайпе молча стала бы общей лентой.
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("category=poslovitsy"),
        expect.anything(),
      ),
    );
  });

  // VED-121: картинки нейросети и готовые открытки — разные ленты.
  it("shows the cards tab and keeps the folder and order in the tab links", () => {
    fetchOk({});
    render(
      <ReelsFeed
        initial={{ items: [post("a")], nextCursor: null }}
        tab="cards"
        donation={null}
        order="random"
        category="poslovitsy"
      />,
    );

    const tabs = screen.getByRole("navigation", { name: "Вкладки ленты" });
    expect(within(tabs).getByRole("link", { name: "Открытки" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(within(tabs).getByRole("link", { name: "Лента" })).toHaveAttribute(
      "href",
      "/motivation?category=poslovitsy&order=random",
    );
    expect(within(tabs).getByRole("link", { name: "Открытки" })).toHaveAttribute(
      "href",
      "/motivation?tab=cards&category=poslovitsy&order=random",
    );
  });

  it("keeps the tabs on an empty cards feed so the reader can leave it", () => {
    fetchOk({});
    render(
      <ReelsFeed initial={{ items: [], nextCursor: null }} tab="cards" donation={null} />,
    );

    expect(screen.getByText("Открыток здесь пока нет")).toBeInTheDocument();
    const tabs = screen.getByRole("navigation", { name: "Вкладки ленты" });
    expect(within(tabs).getByRole("link", { name: "Избранное" })).toHaveAttribute(
      "href",
      "/motivation?tab=saved",
    );
  });

  // VED-252: пустое состояние держит Tabs()/FeedAttributionFilter в обычном
  // потоке (flex-col), а не в абсолютном ряду — с активным фильтром чип
  // должен просто показаться строкой, без поломки раскладки колонки.
  it("на пустой ленте с активным фильтром чип виден и не ломает колонку", () => {
    fetchOk({});
    render(
      <ReelsFeed
        initial={{ items: [], nextCursor: null }}
        tab="cards"
        donation={null}
        work="Бхагавад-гита"
      />,
    );

    expect(screen.getByText("Открыток здесь пока нет")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Убрать фильтр по источнику: Бхагавад-гита" }),
    ).toBeInTheDocument();
  });

  // VED-252, круг 4: значок фильтра здесь — не в ряду вкладок (тот
  // `absolute`, из потока `flex-col` исключён), а отдельной строкой; без
  // подписи и подложки он висел бы голой полупрозрачной иконкой, ничего не
  // объясняя (баг, который не ловил ни один из первых трёх кругов).
  // `variant="chip"` должен вернуть самостоятельную пилюлю с подписью,
  // видимой, пока фильтр не выбран.
  it("на пустой ленте без активного фильтра кнопка подписана, а не голый значок", () => {
    fetchOk({});
    render(
      <ReelsFeed initial={{ items: [], nextCursor: null }} tab="cards" donation={null} />,
    );

    expect(screen.getByText("Открыток здесь пока нет")).toBeInTheDocument();
    const trigger = screen.getByRole("button", { name: "Фильтр по автору и источнику" });
    expect(trigger).toHaveTextContent("Автор и источник");
    // Самостоятельная пилюля — рамка и подложка, а не «inline»-значок без
    // подписи (`w-7`), уместный только внутри ряда вкладок.
    expect(trigger.className).toMatch(/rounded-full/);
    expect(trigger.className).toMatch(/\bborder\b/);
    expect(trigger.className).not.toMatch(/\bw-7\b/);
  });

  it.each([
    ["cards", "style=cards"],
    ["forYou", "style=art"],
  ] as const)(
    "asks the next page of the %s tab in the same style",
    async (tab, expected) => {
      const fetchMock = fetchOk({ items: [], nextCursor: null });
      class EagerObserver {
        constructor(private readonly notify: (entries: unknown[]) => void) {}
        observe(node: Element) {
          this.notify([{ isIntersecting: true, intersectionRatio: 1, target: node }]);
        }
        disconnect() {}
        unobserve() {}
      }
      vi.stubGlobal("IntersectionObserver", EagerObserver);

      render(
        <ReelsFeed
          initial={{ items: [post("a")], nextCursor: "cursor-1" }}
          tab={tab}
          donation={null}
        />,
      );

      // Без стиля вторая страница открыток пришла бы вперемешку с
      // нейрокартинками.
      await waitFor(() =>
        expect(fetchMock).toHaveBeenCalledWith(
          expect.stringContaining(expected),
          expect.anything(),
        ),
      );
    },
  );

  it("does not split favourites by style", async () => {
    const fetchMock = fetchOk({ items: [], nextCursor: null });
    class EagerObserver {
      constructor(private readonly notify: (entries: unknown[]) => void) {}
      observe(node: Element) {
        this.notify([{ isIntersecting: true, intersectionRatio: 1, target: node }]);
      }
      disconnect() {}
      unobserve() {}
    }
    vi.stubGlobal("IntersectionObserver", EagerObserver);

    render(
      <ReelsFeed
        initial={{ items: [post("a")], nextCursor: "cursor-1" }}
        tab="saved"
        donation={null}
      />,
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(String(fetchMock.mock.calls[0][0])).not.toContain("style=");
  });

  it("offers the purport only for a post that came from a chapter of the Library", () => {
    fetchOk({});
    render(
      <ReelsFeed
        initial={{
          items: [
            post("a", {
              library: { bookSlug: "bhagavad-gita", chapterSlug: "2" },
            }),
            post("b"),
          ],
          nextCursor: null,
        }}
        tab="forYou"
        donation={null}
      />,
    );

    const links = screen.getAllByRole("link", { name: /Комментарий/ });
    // Ровно один: у второго слайда главы нет, и кнопка, ведущая в поиск
    // «где-то там», обещала бы комментарий и не показала бы его.
    expect(links).toHaveLength(1);
    /* Адрес карточки уезжает с собой: из главы возвращаются к тому афоризму,
       с которого в неё пришли, а не в оглавление библиотеки. */
    expect(links[0]).toHaveAttribute(
      "href",
      "/vedabase/books/bhagavad-gita/2?fromPost=a",
    );
  });

  it("offers to report someone else's reel but not your own", () => {
    fetchOk({});
    render(
      <ReelsFeed
        initial={{
          items: [
            post("a", { origin: "user", author: { id: "u-gopal", name: "Гопал" }, isOwn: false }),
            post("b", { origin: "user", author: { id: "u-me", name: "Я" }, isOwn: true }),
            post("c"),
          ],
          nextCursor: null,
        }}
        tab="forYou"
        donation={null}
      />,
    );

    // Одна кнопка на три слайда: редакционный и свой собственный её не имеют.
    expect(screen.getAllByRole("button", { name: "Пожаловаться" })).toHaveLength(1);
  });

  it("ведёт в профиль того, кто принёс ролик: в кадр вшит источник, а не он", () => {
    fetchOk({});
    render(
      <ReelsFeed
        initial={{
          items: [
            post("a", {
              videoUrl: "https://cdn/a.mp4",
              origin: "user",
              author: { id: "u-gopal", name: "Гопал" },
            }),
          ],
          nextCursor: null,
        }}
        tab="forYou"
        donation={null}
      />,
    );

    /* Раньше подписи у ролика не было вовсе: считалось, что её несёт сам кадр.
       Кадр несёт другое — воркер вшивает туда attributionLine, то есть автора
       цитаты и книгу, а не того, кто принёс ролик. Имя дублировать нечему, и
       без ссылки в профиль участника из ленты было не попасть. Ссылка стоит в
       общем ряду, отдельной строкой поверх кадра она закрыла бы конец
       вшитой цитаты. */
    expect(screen.getByRole("link", { name: "Гопал" })).toHaveAttribute(
      "href",
      "/chat/people/users/u-gopal",
    );
  });

  // VED-151: строка брала базовую линию у пустого кружка, и имя сидело выше
  // соседнего текста подписи.
  it("выравнивает имя в подписи по базовой линии текста, а не по кружку", () => {
    fetchOk({});
    render(
      <ReelsFeed
        initial={{
          items: [post("a", { origin: "user", author: { id: "u-gopal", name: "Гопал" } }), post("b")],
          nextCursor: null,
        }}
        tab="forYou"
        donation={null}
      />,
    );

    expect(screen.getByText("Гопал")).toHaveClass("self-baseline");
    expect(screen.getByText("VedaMatch")).toHaveClass("self-baseline");
  });

  // VED-120: у каждого афоризма видна категория, и по ней открывается её лента.
  it.each([
    ["an illustration", {}, "/motivation?category=daily"],
    ["a ready card", { captionInImage: true }, "/motivation?tab=cards&category=daily"],
    ["a video", { videoUrl: "https://cdn/a.mp4" }, "/motivation?category=daily"],
  ] as const)("shows the category of %s as a link to its feed", (_, overrides, href) => {
    fetchOk({});
    render(
      <ReelsFeed
        initial={{ items: [post("a", overrides)], nextCursor: null }}
        tab="forYou"
        donation={null}
      />,
    );

    expect(
      screen.getByRole("link", { name: "Категория: Каждый день" }),
    ).toHaveAttribute("href", href);
  });

  it("hides a category the catalogue does not know instead of showing its slug", () => {
    fetchOk({});
    render(
      <ReelsFeed
        initial={{ items: [post("a", { categoryTitle: "daily" })], nextCursor: null }}
        tab="forYou"
        donation={null}
      />,
    );

    expect(screen.queryByRole("link", { name: /Категория/ })).not.toBeInTheDocument();
    expect(screen.queryByText("daily")).not.toBeInTheDocument();
  });

  it("does not draw the quote over a video: the clip already carries it", () => {
    fetchOk({});
    render(
      <ReelsFeed
        initial={{
          items: [post("a", { videoUrl: "https://cdn/a.mp4", storyImageUrl: "https://cdn/a-story.webp" })],
          nextCursor: null,
        }}
        tab="forYou"
        donation={null}
      />,
    );

    expect(screen.queryByText("Цитата a")).not.toBeInTheDocument();
    // Постер — тот же кадр с подписью, что и первый кадр ролика.
    expect(document.querySelector("video")).toHaveAttribute("poster", "https://cdn/a-story.webp");
    // Действия и подпись автора остаются: они не часть кадра.
    expect(screen.getByRole("button", { name: "Нравится" })).toBeInTheDocument();
  });

  it("starts muted and gives one sound switch for the whole feed", async () => {
    fetchOk({});
    const user = userEvent.setup();
    render(
      <ReelsFeed
        initial={{
          items: [
            post("a", {
              videoUrl: "https://cdn/a.mp4",
              videoHasSound: true,
              storyImageUrl: "https://cdn/a-story.webp",
            }),
          ],
          nextCursor: null,
        }}
        tab="forYou"
        donation={null}
      />,
    );

    const video = document.querySelector("video") as HTMLVideoElement;
    // Со звуком браузер не даст автозапуск, поэтому лента молчит до просьбы.
    expect(video.muted).toBe(true);
    // Кадр показывается целиком: обрезка съедала вшитую подпись по краям.
    expect(video.className).toContain("object-contain");

    await user.click(screen.getByRole("button", { name: /Включить звук/ }));
    expect(video.muted).toBe(false);
    expect(screen.getByRole("button", { name: /Звук включён/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("keeps the sound switch away from a silent clip", () => {
    fetchOk({});
    render(
      <ReelsFeed
        initial={{
          items: [post("a", { videoUrl: "https://cdn/a.mp4", videoHasSound: false })],
          nextCursor: null,
        }}
        tab="forYou"
        donation={null}
      />,
    );

    expect(screen.queryByRole("button", { name: /звук/i })).not.toBeInTheDocument();
  });

  it("предлагает создать свой рилс там, где смотреть больше нечего", () => {
    fetchOk({});
    render(
      <ReelsFeed
        initial={{ items: [post("a")], nextCursor: null }}
        tab="forYou"
        donation={null}
      />,
    );

    const create = screen.getAllByRole("link", { name: /Создать рилс/ });
    expect(create.length).toBeGreaterThan(0);
    expect(create[0]).toHaveAttribute("href", "/motivation/create");
  });

  // VED-240: из вкладки «Открытки» ссылка «Создать» ведёт в мастер с
  // ?tab=cards — так первым выбором там стоит «Готовая картинка с цитатой»,
  // а не «Написать самому». На «Ленте» параметра быть не должно (проверено
  // выше, тест не переписан специально ради этого).
  it("на вкладке «Открытки» ссылки «Создать» несут ?tab=cards", () => {
    fetchOk({});
    render(
      <ReelsFeed initial={{ items: [post("a")], nextCursor: null }} tab="cards" donation={null} />,
    );

    expect(screen.getByRole("link", { name: "Создать свой рилс" })).toHaveAttribute(
      "href",
      "/motivation/create?tab=cards",
    );
    for (const link of screen.getAllByRole("link", { name: /Создать рилс/ })) {
      expect(link).toHaveAttribute("href", "/motivation/create?tab=cards");
    }
  });

  it("tells an empty saved tab where to go", () => {
    fetchOk({});
    render(<ReelsFeed initial={{ items: [], nextCursor: null }} tab="saved" donation={null} />);

    expect(screen.getByText("В избранном пока пусто")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "К ленте" })).toHaveAttribute("href", "/motivation");
  });

  it("показывает «Читать полностью» у длинной цитаты фото-поста и открывает её целиком", async () => {
    fetchOk({});
    const longQuote =
      "Преданность освобождает ум от иллюзии и открывает путь к истинному счастью. ".repeat(
        3,
      );
    render(
      <ReelsFeed
        initial={{ items: [post("a", { text: longQuote })], nextCursor: null }}
        tab="forYou"
        donation={null}
      />,
    );

    const toggle = screen.getByRole("button", { name: "Читать полностью ›" });
    await userEvent.click(toggle);

    expect(screen.getByText("Цитата целиком")).toBeInTheDocument();
  });

  // VED-241: надпись на картинке и полный текст правятся порознь.
  it("кладёт на картинку поправленную надпись, а в «Читать полностью» — полный текст", async () => {
    fetchOk({});
    render(
      <ReelsFeed
        initial={{
          items: [
            post("a", {
              text: "Полный текст шлоки целиком\n\nПояснение",
              imageText: "Короткая надпись",
            }),
          ],
          nextCursor: null,
        }}
        tab="forYou"
        donation={null}
      />,
    );

    expect(screen.getByText("Короткая надпись")).toBeInTheDocument();
    expect(screen.queryByText("Полный текст шлоки целиком")).not.toBeInTheDocument();

    // Надпись короткая, но отличается от полного текста — кнопка нужна.
    await userEvent.click(
      screen.getByRole("button", { name: "Читать полностью ›" }),
    );
    expect(screen.getByText("Полный текст шлоки целиком")).toBeInTheDocument();
  });

  it("не показывает «Читать полностью» у короткой цитаты", () => {
    fetchOk({});
    render(
      <ReelsFeed
        initial={{ items: [post("a")], nextCursor: null }}
        tab="forYou"
        donation={null}
      />,
    );

    expect(
      screen.queryByRole("button", { name: "Читать полностью ›" }),
    ).not.toBeInTheDocument();
  });

  it("показывает «Читать полностью» и у длинной цитаты видео-поста", () => {
    fetchOk({});
    const longQuote =
      "Преданность освобождает ум от иллюзии и открывает путь к истинному счастью. ".repeat(
        3,
      );
    render(
      <ReelsFeed
        initial={{
          items: [
            post("a", { text: longQuote, videoUrl: "https://cdn/a.mp4" }),
          ],
          nextCursor: null,
        }}
        tab="forYou"
        donation={null}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Читать полностью ›" }),
    ).toBeInTheDocument();
  });

  it("убирает текст с картинки и возвращает его тем же нажатием", async () => {
    const user = userEvent.setup();
    render(
      <ReelsFeed
        initial={{ items: [post("a")], nextCursor: null }}
        tab="forYou"
        donation={null}
      />,
    );

    expect(screen.getByText("Цитата a")).toBeVisible();
    const off = screen.getByRole("button", { name: TEXT_OFF });
    expect(off).toHaveAttribute("aria-pressed", "false");
    await user.click(off);

    // Цитата убрана, но остаётся в разметке: возвращают её тем же нажатием.
    expect(screen.getByText("Цитата a")).not.toBeVisible();
    const on = screen.getByRole("button", { name: TEXT_ON });
    expect(on).toHaveAttribute("aria-pressed", "true");

    await user.click(on);
    expect(screen.getByText("Цитата a")).toBeVisible();
    expect(screen.getByRole("button", { name: TEXT_OFF })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("убранный текст держится, пока его не вернут", async () => {
    const user = userEvent.setup();
    render(
      <ReelsFeed
        initial={{ items: [post("a")], nextCursor: null }}
        tab="forYou"
        donation={null}
      />,
    );

    await user.click(screen.getByRole("button", { name: TEXT_OFF }));
    // Прежняя кнопка возвращала кадр через пять секунд; эту включают, чтобы
    // листать картинки без надписей, и сама она не выключается.
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(screen.getByRole("button", { name: TEXT_ON })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByText("Цитата a")).not.toBeVisible();
  });

  /**
   * Суть VED-251: тестировщик нажал в ленте кнопку, подписанную как
   * редакторская «Скрыть из ленты» (та снимает афоризм у ВСЕХ читателей через
   * `PATCH /admin/motivation/posts/:id`), и ждал того же. Публичная кнопка не
   * меняет ничего ни у кого, поэтому ни её доступное имя, ни подпись под
   * значком не вправе начинаться со «Скрыть» — именно это здесь и проверяем,
   * а не конкретную формулировку.
   */
  it("подписью не притворяется редакторским «Скрыть из ленты»", () => {
    render(
      <ReelsFeed
        initial={{ items: [post("a")], nextCursor: null }}
        tab="forYou"
        donation={null}
      />,
    );

    const button = screen.getByRole("button", { name: TEXT_OFF });
    const name = button.getAttribute("aria-label") ?? "";
    expect(name).not.toMatch(/скры|спрят/i);
    expect(name).toMatch(/текст/i);
    // Подпись под значком — то, что человек читает глазами; «Скрыть» в ряду
    // ленты и «Скрыть» в админке выглядели одинаково.
    expect(button.textContent ?? "").not.toMatch(/скры|спрят/i);
    // И никакой кнопки с редакторским именем в публичной ленте нет вовсе.
    expect(
      screen.queryByRole("button", { name: /скрыть/i }),
    ).not.toBeInTheDocument();
  });

  it("у ролика прятать нечего: подпись вшита в кадр", () => {
    render(
      <ReelsFeed
        initial={{
          items: [post("a", { videoUrl: "https://cdn/a.mp4" })],
          nextCursor: null,
        }}
        tab="forYou"
        donation={null}
      />,
    );

    expect(
      screen.queryByRole("button", { name: /без текста/i }),
    ).not.toBeInTheDocument();
  });

  it("читает цитату голосом устройства и замолкает по второму нажатию", async () => {
    const speak = vi.fn();
    const cancel = vi.fn();
    vi.stubGlobal("speechSynthesis", { speak, cancel });
    vi.stubGlobal(
      "SpeechSynthesisUtterance",
      class {
        text: string;
        lang = "";
        constructor(text: string) {
          this.text = text;
        }
      },
    );
    const user = userEvent.setup();
    render(
      <ReelsFeed
        initial={{ items: [post("a")], nextCursor: null }}
        tab="forYou"
        donation={null}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Озвучить цитату" }));

    const utterance = speak.mock.calls[0][0] as { text: string; lang: string };
    expect(utterance.text).toContain("Цитата a");
    // Пояснение голосом не читается: его читают глазами.
    expect(utterance.text).not.toContain("Пояснение a");
    expect(utterance.lang).toBe("ru-RU");

    await user.click(screen.getByRole("button", { name: "Остановить чтение" }));
    expect(cancel).toHaveBeenCalled();
  });

  it("без синтеза речи кнопки нет: молчащая кнопка хуже её отсутствия", () => {
    render(
      <ReelsFeed
        initial={{ items: [post("a")], nextCursor: null }}
        tab="forYou"
        donation={null}
      />,
    );

    expect(
      screen.queryByRole("button", { name: "Озвучить цитату" }),
    ).not.toBeInTheDocument();
  });

  it("редакции даёт перейти к правке той карточки, на которую она смотрит", () => {
    render(
      <ReelsFeed
        initial={{ items: [post("a")], nextCursor: null }}
        tab="forYou"
        donation={null}
        isAdmin
      />,
    );

    expect(
      screen.getByRole("link", { name: "Править эту публикацию" }),
    ).toHaveAttribute("href", "/admin/motivation/published?post=a");
  });

  it("обычному читателю правки не предлагает", () => {
    render(
      <ReelsFeed
        initial={{ items: [post("a")], nextCursor: null }}
        tab="forYou"
        donation={null}
      />,
    );

    expect(
      screen.queryByRole("link", { name: "Править эту публикацию" }),
    ).not.toBeInTheDocument();
  });
});
