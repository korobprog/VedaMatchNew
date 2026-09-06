import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MotivationReelDto } from "@vedamatch/shared";
import { ReelWizard } from "./reel-wizard";

const quota = { enabled: true, unlimited: false, limit: 1, used: 0, remaining: 1 };

function reelDto(overrides: Partial<MotivationReelDto>): MotivationReelDto {
  return {
    id: "reel-1",
    stage: "ai_review",
    videoState: "none",
    canAnimate: false,
    reason: null,
    fundingNotice: null,
    waitNotice: null,
    videoRejectionNotice: null,
    canAppeal: false,
    sourceKind: "own",
    createdAt: "2026-08-19T10:00:00.000Z",
    post: {
      id: "reel-1",
      slug: "reel-x",
      contentDate: "2026-08-19",
      profileType: "user",
      audienceTrack: "universal",
      category: "daily",
      categoryTitle: "daily",
      imageUrl: "",
      storyImageUrl: "",
      videoUrl: "",
      videoHasSound: false,
      title: "Свой рилс",
      text: "Делай что должно, и будь что будет.",
      storyText: "",
      attributionKind: "ai_reflection",
      attributionSpeaker: null,
      attributionWork: null,
      attributionLocator: null,
      attributionSourceUrl: null,
      sourceVerified: false,
      publishedAt: "",
      isFavorite: false,
      isViewed: false,
      likeCount: 0,
      isLiked: false,
      origin: "user",
      author: null,
      isOwn: true,
      library: null,
    },
    ...overrides,
  };
}

/** fetch, отвечающий по URL: квота, создание, статус. */
function routeFetch(routes: Record<string, (init?: RequestInit) => unknown>) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const key = Object.keys(routes).find((pattern) => url.includes(pattern));
    if (!key) throw new Error(`unexpected ${url}`);
    const body = routes[key](init);
    return { ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) };
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

beforeEach(() => vi.restoreAllMocks());

describe("ReelWizard", () => {
  it("walks quote → style → status and posts the reel", async () => {
    const fetchMock = routeFetch({
      "/motivation/reels/quota": () => quota,
      "/motivation/reels/reel-1": () => reelDto({ stage: "generating" }),
      "/motivation/reels": () => ({ id: "reel-1", stage: "generating", reason: null }),
    });
    const user = userEvent.setup();
    render(<ReelWizard prefill={{}} donation={null} />);

    await screen.findByText("Сегодня: 0 из 1");
    const next = screen.getByRole("button", { name: "Дальше: формат и стиль" });
    expect(next).toBeDisabled();
    await user.type(screen.getByLabelText(/Текст цитаты/), "Делай что должно, и будь что будет.");
    await user.type(screen.getByLabelText(/Автор/), "Марк Аврелий");
    await user.click(next);

    await user.click(screen.getByRole("button", { name: /Вайшнавская мудрость/ }));
    await user.selectOptions(screen.getByLabelText(/Визуальный стиль/), "indian_miniature");
    await user.click(screen.getByRole("button", { name: "Отправить на проверку" }));

    await waitFor(() => expect(screen.getByText("Шаг 3 из 3 · Сборка")).toBeInTheDocument());
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === "POST");
    expect(post?.[0]).toContain("/motivation/reels");
    expect(JSON.parse(String(post?.[1]?.body))).toEqual({
      source: { kind: "own", text: "Делай что должно, и будь что будет.", author: "Марк Аврелий" },
      language: "ru",
      audienceTrack: "vaishnava",
      visualStyle: "indian_miniature",
      explanation: null,
    });
    // Обещание уведомления стоит на самом шаге: человек смотрит на «Картинку»
    // и решает, ждать ему или уходить.
    expect(await screen.findByText(/мы пришлём уведомление/)).toBeInTheDocument();
    expect(screen.getByText("Сегодня: 1 из 1")).toBeInTheDocument();
  });

  it("prefills a book fragment and sends it as a vedabase source", async () => {
    const fetchMock = routeFetch({
      "/motivation/reels/quota": () => quota,
      "/motivation/reels/reel-1": () => reelDto({ stage: "ai_review" }),
      "/motivation/reels": () => ({ id: "reel-1", stage: "ai_review", reason: null }),
    });
    const user = userEvent.setup();
    render(<ReelWizard prefill={{ book: "bg", chapter: "2", text: "Ты имеешь право лишь на действие." }} donation={null} />);

    await screen.findByText("Сегодня: 0 из 1");
    expect(screen.getByLabelText(/Текст цитаты/)).toHaveValue("Ты имеешь право лишь на действие.");
    await user.click(screen.getByRole("button", { name: "Дальше: формат и стиль" }));
    await user.click(screen.getByRole("button", { name: "Отправить на проверку" }));

    await waitFor(() => expect(fetchMock.mock.calls.some(([, init]) => init?.method === "POST")).toBe(true));
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === "POST");
    expect(JSON.parse(String(post?.[1]?.body)).source).toEqual({
      kind: "vedabase",
      text: "Ты имеешь право лишь на действие.",
      bookSlug: "bg",
      chapterSlug: "2",
    });
  });

  it("lets a person find a verse in the books without coming from the reader", async () => {
    const hit = {
      text: "Ты имеешь право лишь на действие, но не на его плоды.",
      bookSlug: "bhagavad-gita",
      bookTitle: "Бхагавад-гита как она есть",
      chapterSlug: "2",
      locator: "2.47",
    };
    const fetchMock = routeFetch({
      "/motivation/reels/quota": () => quota,
      "/motivation/reels/books": () => [],
      "/motivation/reels/sources": () => [hit],
      "/motivation/reels/reel-1": () => reelDto({ stage: "ai_review" }),
      "/motivation/reels": () => ({ id: "reel-1", stage: "ai_review", reason: null }),
    });
    const user = userEvent.setup();
    render(<ReelWizard prefill={{}} donation={null} />);

    await screen.findByText("Сегодня: 0 из 1");
    await user.click(screen.getByRole("button", { name: /Взять из наших книг/ }));
    await user.click(screen.getByRole("tab", { name: /Поиск по словам/ }));
    await user.type(screen.getByLabelText("Поиск по книгам"), "право на действие");
    await user.click(screen.getByRole("button", { name: "Найти" }));

    await user.click(await screen.findByRole("button", { name: new RegExp(hit.text) }));
    // Выбранный фрагмент подставился в поле и подписан книгой.
    expect(screen.getByLabelText(/Текст цитаты/)).toHaveValue(hit.text);
    expect(screen.getByText("Бхагавад-гита как она есть")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Дальше: формат и стиль" }));
    await user.click(screen.getByRole("button", { name: "Отправить на проверку" }));

    await waitFor(() => expect(fetchMock.mock.calls.some(([, init]) => init?.method === "POST")).toBe(true));
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === "POST");
    expect(JSON.parse(String(post?.[1]?.body)).source).toEqual({
      kind: "vedabase",
      text: hit.text,
      bookSlug: "bhagavad-gita",
      chapterSlug: "2",
    });
  });

  it("browses a book by its table of contents", async () => {
    const hit = {
      text: "Ум — друг обусловленной души и её же враг, и человек должен это помнить.",
      bookSlug: "demo-bhagavad-gita",
      bookTitle: "Бхагавад-гита как она есть (демо)",
      chapterSlug: "chapter-6",
      locator: "6.5",
    };
    routeFetch({
      "/motivation/reels/quota": () => quota,
      "/motivation/reels/books/demo-bhagavad-gita/chapters/chapter-6": () => [hit],
      "/motivation/reels/books": () => [
        {
          slug: "demo-bhagavad-gita",
          title: "Бхагавад-гита как она есть (демо)",
          author: "Прабхупада",
          chapters: [{ slug: "chapter-6", title: "Глава 6. Дхьяна-йога" }],
        },
      ],
    });
    const user = userEvent.setup();
    render(<ReelWizard prefill={{}} donation={null} />);

    await screen.findByText("Сегодня: 0 из 1");
    await user.click(screen.getByRole("button", { name: /Взять из наших книг/ }));

    // Оглавление открыто сразу: поиск по словам — второй способ, не первый.
    await user.selectOptions(await screen.findByLabelText("Книга"), "demo-bhagavad-gita");
    await user.selectOptions(await screen.findByLabelText("Глава"), "chapter-6");
    await user.click(await screen.findByRole("button", { name: new RegExp(hit.text) }));

    expect(screen.getByLabelText(/Текст цитаты/)).toHaveValue(hit.text);
    expect(screen.getByText("6.5")).toBeInTheDocument();
  });

  it("does not let you continue with the books option until a fragment is chosen", async () => {
    routeFetch({
      "/motivation/reels/quota": () => quota,
      "/motivation/reels/books": () => [],
      "/motivation/reels/sources": () => [],
    });
    const user = userEvent.setup();
    render(<ReelWizard prefill={{}} donation={null} />);

    await screen.findByText("Сегодня: 0 из 1");
    await user.click(screen.getByRole("button", { name: /Взять из наших книг/ }));
    await user.type(screen.getByLabelText(/Текст цитаты/), "Просто набранный вручную текст.");

    expect(screen.getByRole("button", { name: "Дальше: формат и стиль" })).toBeDisabled();
  });

  it("shows the rejection reason and lets the author appeal once", async () => {
    const fetchMock = routeFetch({
      "/motivation/reels/quota": () => quota,
      "/motivation/reels/reel-1/appeal": () => reelDto({ stage: "rejected", reason: "Это реклама.", canAppeal: false }),
      "/motivation/reels/reel-1": () => reelDto({ stage: "rejected", reason: "Это реклама.", canAppeal: true }),
    });
    const user = userEvent.setup();
    render(<ReelWizard prefill={{ reelId: "reel-1" }} donation={null} />);

    expect(await screen.findByText("Это реклама.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Исправить и отправить снова" })).toBeInTheDocument();
    await user.type(screen.getByLabelText(/Напишите администратору/), "Это цитата из книги, не реклама");
    await user.click(screen.getByRole("button", { name: "✉ Написать администратору" }));

    await waitFor(() => expect(screen.getByText(/Обращение отправлено/)).toBeInTheDocument());
    const appeal = fetchMock.mock.calls.find(([url]) => url.includes("/appeal"));
    expect(JSON.parse(String(appeal?.[1]?.body))).toEqual({ message: "Это цитата из книги, не реклама" });
  });

  it("uploads a chosen picture right after creating the reel", async () => {
    const fetchMock = routeFetch({
      "/motivation/reels/quota": () => quota,
      "/motivation/reels/reel-1/image": () => reelDto({ stage: "image_review" }),
      "/motivation/reels/reel-1": () => reelDto({ stage: "image_review" }),
      "/motivation/reels": () => ({ id: "reel-1", stage: "generating", reason: null }),
    });
    const user = userEvent.setup();
    render(<ReelWizard prefill={{}} donation={null} />);

    await screen.findByText("Сегодня: 0 из 1");
    await user.type(screen.getByLabelText(/Текст цитаты/), "Делай что должно, и будь что будет.");
    await user.click(screen.getByRole("button", { name: "Дальше: формат и стиль" }));
    await user.click(screen.getByRole("button", { name: /Загрузить своё/ }));

    // Пока файла нет, отправка закрыта: иначе рилс уйдёт без картинки.
    expect(screen.getByRole("button", { name: "Отправить на проверку" })).toBeDisabled();
    const picture = new File(["binary"], "photo.jpg", { type: "image/jpeg" });
    await user.upload(screen.getByLabelText(/Файл/), picture);
    expect(screen.getByLabelText(/Визуальный стиль/)).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Отправить на проверку" }));

    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/image"))).toBe(true),
    );
    const upload = fetchMock.mock.calls.find(([url]) => String(url).includes("/image"));
    expect((upload?.[1] as RequestInit | undefined)?.body).toBeInstanceOf(FormData);
  });

  it("asks for voice, music and length before building the clip", async () => {
    const published = reelDto({ stage: "published", canAnimate: true, videoState: "none" });
    const queued = reelDto({ stage: "published", canAnimate: false, videoState: "queued" });
    let animated = false;
    const fetchMock = routeFetch({
      "/motivation/reels/quota": () => quota,
      "/motivation/reels/voices": () => [
        { value: "Aria", label: "Женский, тёплый", sampleUrl: "https://cdn/aria.mp3", isDefault: true },
        { value: "Roger", label: "Мужской, глубокий", sampleUrl: null, isDefault: false },
      ],
      "/motivation/reels/music": () => [
        { id: "track-1", title: "Утренняя мантра", seconds: 30, url: "https://cdn/t1.mp3" },
      ],
      "/motivation/reels/reel-1/animate": () => {
        animated = true;
        return queued;
      },
      "/motivation/reels/reel-1": () => (animated ? queued : published),
    });
    const user = userEvent.setup();
    render(<ReelWizard prefill={{ reelId: "reel-1" }} donation={null} />);

    await user.click(await screen.findByRole("button", { name: /Оживить в видео/ }));

    // Голос, отмеченный редакцией, предвыбран — человеку не с чего начинать.
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Женский, тёплый" })).toHaveAttribute(
        "aria-pressed",
        "true",
      ),
    );
    expect(screen.getByRole("button", { name: /Послушать голос/ })).toBeInTheDocument();
    await user.click(await screen.findByRole("button", { name: "Утренняя мантра" }));
    await user.click(screen.getByRole("button", { name: "Ветер и свет" }));
    await user.click(screen.getByRole("button", { name: "10 секунд" }));
    await user.click(screen.getByRole("button", { name: "Создать ролик" }));

    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/animate"))).toBe(true),
    );
    const call = fetchMock.mock.calls.find(([url]) => String(url).includes("/animate"));
    expect(JSON.parse(String((call?.[1] as RequestInit).body))).toEqual({
      voice: "Aria",
      trackId: "track-1",
      seconds: 10,
      motion: "nature",
    });
  });

  it("falls back to silence when the editors offered no voices", async () => {
    routeFetch({
      "/motivation/reels/quota": () => quota,
      "/motivation/reels/voices": () => [],
      "/motivation/reels/music": () => [],
      "/motivation/reels/reel-1": () =>
        reelDto({ stage: "published", canAnimate: true, videoState: "none" }),
    });
    const user = userEvent.setup();
    render(<ReelWizard prefill={{ reelId: "reel-1" }} donation={null} />);

    await user.click(await screen.findByRole("button", { name: /Оживить в видео/ }));

    // Без голосов остаётся одно облачко «Без озвучки», и оно же выбрано.
    expect(await screen.findByRole("button", { name: "Без озвучки" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.queryByRole("button", { name: /Послушать голос/ })).not.toBeInTheDocument();
  });

  it("says when the music library is empty instead of showing an empty list", async () => {
    routeFetch({
      "/motivation/reels/quota": () => quota,
      "/motivation/reels/voices": () => [],
      "/motivation/reels/music": () => [],
      "/motivation/reels/reel-1": () =>
        reelDto({ stage: "published", canAnimate: true, videoState: "none" }),
    });
    const user = userEvent.setup();
    render(<ReelWizard prefill={{ reelId: "reel-1" }} donation={null} />);

    await user.click(await screen.findByRole("button", { name: /Оживить в видео/ }));

    expect(await screen.findByText(/Библиотека музыки пока пуста/)).toBeInTheDocument();
  });

  it("offers to animate a published reel and keeps polling while it renders", async () => {
    const published = reelDto({ stage: "published", canAnimate: true, videoState: "none" });
    const queued = reelDto({ stage: "published", canAnimate: false, videoState: "queued" });
    let animated = false;
    const fetchMock = routeFetch({
      "/motivation/reels/quota": () => quota,
      "/motivation/reels/reel-1/animate": () => {
        animated = true;
        return queued;
      },
      "/motivation/reels/reel-1": () => (animated ? queued : published),
    });
    const user = userEvent.setup();
    render(<ReelWizard prefill={{ reelId: "reel-1" }} donation={null} />);

    await user.click(await screen.findByRole("button", { name: /Оживить в видео/ }));
    await user.click(await screen.findByRole("button", { name: "Создать ролик" }));

    await waitFor(() => expect(screen.getByText(/Оживляем кадр/)).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/motivation/reels/reel-1/animate"),
      expect.objectContaining({ method: "POST" }),
    );
    // Кнопка исчезает, пока ролик в работе: второй заказ ни к чему.
    expect(screen.queryByRole("button", { name: /Оживить в видео/ })).not.toBeInTheDocument();
  });

  it("explains that a rendered clip waits for the administrator", async () => {
    routeFetch({
      "/motivation/reels/quota": () => quota,
      "/motivation/reels/reel-1": () =>
        reelDto({ stage: "published", canAnimate: false, videoState: "review" }),
    });
    render(<ReelWizard prefill={{ reelId: "reel-1" }} donation={null} />);

    expect(await screen.findByText(/ждёт проверки администратора/)).toBeInTheDocument();
  });

  it("объясняет отказ по содержанию вместо предложения повторить", async () => {
    // Повтор с тем же кадром провайдер отвергнет так же и снова выставит счёт,
    // поэтому «можно попробовать ещё раз» здесь — вредный совет.
    routeFetch({
      "/motivation/reels/quota": () => quota,
      "/motivation/reels/reel-1": () =>
        reelDto({
          stage: "published",
          canAnimate: false,
          videoState: "failed",
          videoRejectionNotice:
            "Провайдер видео отклонил этот кадр: его проверка содержания сочла картинку неподходящей.",
        }),
    });
    render(<ReelWizard prefill={{ reelId: "reel-1" }} donation={null} />);

    expect(await screen.findByText(/отклонил этот кадр/)).toBeInTheDocument();
    expect(screen.queryByText(/можно попробовать ещё раз/)).toBeNull();
  });

  it("asks for support and shows requisites when generation ran out of money", async () => {
    routeFetch({
      "/motivation/reels/quota": () => quota,
      "/motivation/reels/reel-1": () =>
        reelDto({
          stage: "published",
          canAnimate: false,
          videoState: "failed",
          fundingNotice: "Закончились средства на генерацию.",
        }),
    });
    render(
      <ReelWizard
        prefill={{ reelId: "reel-1" }}
        donation={{
          enabled: true,
          text: "На развитие портала",
          requisites: [{ kind: "card", label: "Карта", value: "0000 1111 2222 3333" }],
        }}
      />,
    );

    expect(await screen.findByText("Генерация приостановлена")).toBeInTheDocument();
    expect(screen.getByText("Закончились средства на генерацию.")).toBeInTheDocument();
    // Обычное «попробуйте ещё раз» тут не показывается: повтор бесполезен.
    expect(screen.queryByText(/можно попробовать ещё раз/)).not.toBeInTheDocument();
    // Кнопка ведёт в ту же шторку с реквизитами, что и на других экранах;
    // саму шторку открывает нативный dialog, которого в jsdom нет.
    expect(
      screen.getByRole("button", { name: /Помочь оплатить генерацию/ }),
    ).toBeInTheDocument();
    // Шторок на экране две — эта и общая кнопка поддержки внизу, поэтому
    // реквизит ищем среди всех совпадений.
    expect(screen.getAllByText("0000 1111 2222 3333").length).toBeGreaterThan(0);
  });

  it("hides the animate button for a reel that already has a video", async () => {
    routeFetch({
      "/motivation/reels/quota": () => quota,
      "/motivation/reels/reel-1": () =>
        reelDto({ stage: "published", canAnimate: false, videoState: "ready" }),
    });
    render(<ReelWizard prefill={{ reelId: "reel-1" }} donation={null} />);

    await screen.findByRole("link", { name: /Открыть рилс/ });
    expect(screen.queryByRole("button", { name: /Оживить в видео/ })).not.toBeInTheDocument();
  });

  it("blocks the form when the daily quota is spent", async () => {
    routeFetch({ "/motivation/reels/quota": () => ({ ...quota, used: 1, remaining: 0 }) });
    render(<ReelWizard prefill={{}} donation={null} />);

    expect(await screen.findByText("Сегодня рилс уже создан")).toBeInTheDocument();
    expect(screen.queryByLabelText(/Текст цитаты/)).not.toBeInTheDocument();
  });
});
