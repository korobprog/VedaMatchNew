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
  title: `Пост ${id}`,
  text: `Цитата ${id}\n\nПояснение ${id}`,
  storyText: "",
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
  isOwn: false,
  feedTier: "unseen",
  ...overrides,
});

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
    expect(within(articles[0]).getByText("Кришна · Бхагавад-гита · 2.47")).toBeInTheDocument();
    // Разделитель стоит ровно перед первым повтором и после непросмотренного.
    const divider = within(feed).getByRole("region", { name: "Всё новое просмотрено" });
    expect(divider.compareDocumentPosition(articles[1]) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();
    expect(divider.compareDocumentPosition(articles[2]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(feed).getByRole("region", { name: "Конец ленты" })).toBeInTheDocument();
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

  it("signs editorial posts with the service and user reels with their author", () => {
    fetchOk({});
    render(
      <ReelsFeed
        initial={{
          items: [
            post("a"),
            post("b", { origin: "user", author: { name: "Радха-деви" } }),
          ],
          nextCursor: null,
        }}
        tab="forYou"
        donation={null}
      />,
    );

    expect(screen.getByText("VedaMatch · ежедневная")).toBeInTheDocument();
    expect(screen.getByText("Радха-деви · рилс участника")).toBeInTheDocument();
  });

  it("offers to report someone else's reel but not your own", () => {
    fetchOk({});
    render(
      <ReelsFeed
        initial={{
          items: [
            post("a", { origin: "user", author: { name: "Гопал" }, isOwn: false }),
            post("b", { origin: "user", author: { name: "Я" }, isOwn: true }),
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

  it("keeps the author line off video slides: the clip already carries it", () => {
    fetchOk({});
    render(
      <ReelsFeed
        initial={{
          items: [
            post("a", {
              videoUrl: "https://cdn/a.mp4",
              origin: "user",
              author: { name: "Гопал" },
            }),
          ],
          nextCursor: null,
        }}
        tab="forYou"
        donation={null}
      />,
    );

    // Вторая подпись поверх кадра закрывала бы конец вшитой цитаты.
    expect(screen.queryByText("Гопал · рилс участника")).not.toBeInTheDocument();
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

  it("прячет картинку на пять секунд и возвращает сама", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(
      <ReelsFeed
        initial={{ items: [post("a")], nextCursor: null }}
        tab="forYou"
        donation={null}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "Скрыть картинку на пять секунд" }),
    );
    expect(
      screen.getByRole("button", { name: "Показать картинку" }),
    ).toHaveAttribute("aria-pressed", "true");

    // «На пять секунд», а не «выключить»: кадр возвращается сам.
    vi.advanceTimersByTime(5_000);
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Скрыть картинку на пять секунд" }),
      ).toHaveAttribute("aria-pressed", "false"),
    );
    vi.useRealTimers();
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
      screen.queryByRole("button", { name: /Скрыть картинку/ }),
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
});
