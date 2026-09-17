import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { MotivationAdminCandidateDto } from "@vedamatch/shared";
import { QueueBoard } from "./queue-board";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

/**
 * Фикстура очереди: `reviewStatus` решает, в каком разделе окажется карточка
 * (см. `selectTextPosts`/`selectImagePosts`), остальные поля — минимум,
 * достаточный, чтобы `QuoteReviewCard`/`ImageReviewCard` не упали на рендере.
 */
function post(
  over: Partial<MotivationAdminCandidateDto> = {},
): MotivationAdminCandidateDto {
  return {
    id: "post-1",
    slug: "gita-2-13",
    contentDate: "2026-08-16",
    profileType: "user",
    audienceTrack: "universal",
    category: "philosophy",
    categoryTitle: "Философия",
    imageUrl: "",
    storyImageUrl: "",
    videoUrl: "",
    videoHasSound: false,
    captionInImage: false,
    title: "Душа не умирает",
    text: "Душа не умирает\n\nПояснение к стиху",
    storyText: "",
    imageText: "",
    attributionKind: "exact_quote",
    attributionSpeaker: "Прабхупада",
    attributionWork: "Бхагавад-гита",
    attributionLocator: "2.13",
    attributionSourceUrl: null,
    sourceVerified: false,
    publishedAt: "",
    isFavorite: false,
    isViewed: false,
    likeCount: 0,
    isLiked: false,
    origin: "editorial",
    author: null,
    status: "draft",
    generationStage: null,
    generationErrorCode: null,
    attemptCount: 0,
    reviewStatus: "text_review",
    authorName: null,
    aiVerdict: null,
    appeal: null,
    quote: null,
    profileTypes: [],
    visualStyle: null,
    imagePrompt: null,
    imagePromptEdited: false,
    textApprovedAt: null,
    imageApprovedAt: null,
    videoStatus: "none",
    videoVoice: false,
    videoVoiceName: null,
    videoErrorCode: null,
    videoPrompt: null,
    ...over,
  } as MotivationAdminCandidateDto;
}

const textPost = post();
const imagePost = post({
  id: "post-2",
  slug: "service-eternal",
  title: "Служение — вечная природа",
  text: "Служение — вечная природа\n\nОно приносит радость",
  attributionSpeaker: "Госвами",
  reviewStatus: "image_review",
  textApprovedAt: "2026-08-16T00:00:00.000Z",
});

describe("QueueBoard — поиск в очереди (VED-200)", () => {
  it("без запроса показывает обе карточки и прежние тексты пустой очереди", () => {
    render(<QueueBoard posts={[]} categories={[]} />);

    expect(
      screen.getByText("Нет цитат, ожидающих проверки текста."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Нет изображений, ожидающих проверки."),
    ).toBeInTheDocument();
  });

  it("сужает раздел «Цитаты и текст» независимо от «Изображений»", async () => {
    const user = userEvent.setup();
    render(<QueueBoard posts={[textPost, imagePost]} categories={[]} />);

    await user.type(screen.getByRole("searchbox"), "Прабхупада");

    expect(screen.getByText("Душа не умирает")).toBeInTheDocument();
    expect(
      screen.queryByText("Служение — вечная природа"),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Найдено: 1 из 1")).toBeInTheDocument();
    expect(screen.getByText("Найдено: 0 из 1")).toBeInTheDocument();
  });

  it("ищет по автору без учёта регистра", async () => {
    const user = userEvent.setup();
    render(<QueueBoard posts={[textPost, imagePost]} categories={[]} />);

    await user.type(screen.getByRole("searchbox"), "госвами");

    expect(screen.getByText("Служение — вечная природа")).toBeInTheDocument();
    expect(screen.queryByText("Душа не умирает")).not.toBeInTheDocument();
  });

  it("непустой запрос без совпадений — «Ничего не нашлось» в каждой секции", async () => {
    const user = userEvent.setup();
    render(<QueueBoard posts={[textPost, imagePost]} categories={[]} />);

    await user.type(screen.getByRole("searchbox"), "нет такого слова");

    const messages = screen.getAllByText(
      "Ничего не нашлось. Попробуйте другое слово.",
    );
    expect(messages).toHaveLength(2);
    expect(
      screen.queryByText("Нет цитат, ожидающих проверки текста."),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("Нет изображений, ожидающих проверки."),
    ).not.toBeInTheDocument();
  });

  it("не теряет фокус поля поиска при обновлении списков", async () => {
    const user = userEvent.setup();
    render(<QueueBoard posts={[textPost, imagePost]} categories={[]} />);

    const input = screen.getByRole("searchbox");
    await user.click(input);
    await user.type(input, "Госвами");

    expect(input).toHaveFocus();
  });

  it("очистка поля возвращает обе секции к полному списку", async () => {
    const user = userEvent.setup();
    render(<QueueBoard posts={[textPost, imagePost]} categories={[]} />);

    const input = screen.getByRole("searchbox");
    await user.type(input, "Госвами");
    await user.clear(input);

    expect(screen.getByText("Душа не умирает")).toBeInTheDocument();
    expect(screen.getByText("Служение — вечная природа")).toBeInTheDocument();
    expect(screen.queryByText(/^Найдено:/)).not.toBeInTheDocument();
  });
});
