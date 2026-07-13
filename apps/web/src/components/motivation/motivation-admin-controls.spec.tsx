import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { MotivationAdminCandidateDto } from "@vedamatch/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MotivationAdminControls } from "./motivation-admin-controls";

const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const sourceUrl = "https://vedabase.io/ru/library/bg/2/47/";

function candidate(
  overrides: Partial<MotivationAdminCandidateDto> = {},
): MotivationAdminCandidateDto {
  return {
    id: "post-1",
    slug: "daily-post",
    contentDate: "2026-07-13",
    profileType: "devotee",
    audienceTrack: "vaishnava",
    category: "Мудрость",
    imageUrl: "",
    storyImageUrl: "",
    title: "Действовать без привязанности",
    text: "Этот стих напоминает, что спокойствие рождается из верного действия, а не из контроля результата.",
    storyText: "Действуй искренне и отпускай результат.",
    attributionKind: "exact_quote",
    attributionSpeaker: "Шри Кришна",
    attributionWork: "Бхагавад-гита",
    attributionLocator: "2.47",
    attributionSourceUrl: sourceUrl,
    sourceVerified: true,
    publishedAt: "",
    isFavorite: false,
    isViewed: false,
    status: "draft",
    generationStage: "text",
    generationErrorCode: null,
    attemptCount: 1,
    reviewStatus: "text_review",
    quote: {
      id: "quote-1",
      originalText: "You have a right to perform your prescribed duty, but you are not entitled to the fruits of action.",
      originalLanguage: "en",
      author: "Шри Кришна",
      work: "Бхагавад-гита как она есть",
      locator: "2.47",
      sourceType: "vedamatch_library",
      sourceUrl,
      contextExcerpt: "Арджуна получает наставление о долге и непривязанности к результату.",
      verified: true,
      translations: [
        {
          language: "ru",
          quoteText: "Ты имеешь право исполнять свой долг, но не претендовать на плоды своих действий.",
          translationKind: "vedamatch",
          label: "Перевод VedaMatch",
        },
      ],
    },
    profileTypes: ["yogi", "in_goodness", "devotee"],
    visualStyle: null,
    imagePrompt: null,
    textApprovedAt: null,
    imageApprovedAt: null,
    ...overrides,
  };
}

describe("MotivationAdminControls", () => {
  beforeEach(() => {
    refresh.mockReset();
    vi.unstubAllGlobals();
  });

  it("renders exact quote metadata and approves text without exposing image generation", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, text: async () => "" });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<MotivationAdminControls posts={[candidate()]} />);

    expect(screen.getByRole("heading", { name: "Цитаты и текст" })).toBeInTheDocument();
    expect(screen.getByText(/You have a right to perform/)).toBeInTheDocument();
    expect(screen.getByText("Перевод VedaMatch")).toBeInTheDocument();
    expect(screen.getByText("Шри Кришна · Бхагавад-гита как она есть · 2.47")).toBeInTheDocument();
    expect(screen.getByText(/Арджуна получает наставление/)).toBeInTheDocument();
    expect(screen.getByText("Йог")).toBeInTheDocument();
    expect(screen.getByText("В благости")).toBeInTheDocument();
    expect(screen.getByText("Преданный")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Открыть источник" })).toHaveAttribute("href", sourceUrl);
    expect(screen.queryByRole("button", { name: "Сгенерировать изображение" })).not.toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Стиль изображения для «Действовать без привязанности»"), "spiritual_watercolor");
    await user.click(screen.getByRole("button", { name: "Одобрить текст" }));

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/admin/motivation/posts/post-1/approve-text"),
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        body: JSON.stringify({ visualStyle: "spiritual_watercolor" }),
      }),
    );
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
  });

  it("renders image review with style selection, regeneration and publication", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, text: async () => "" });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    const imagePost = candidate({
      reviewStatus: "image_review",
      status: "draft",
      generationStage: "image",
      imageUrl: "https://cdn.vedamatch.ru/motivation/post-1.png",
      storyImageUrl: "https://cdn.vedamatch.ru/motivation/post-1-story.png",
      visualStyle: "cinematic_nature",
      imagePrompt: "A quiet sunrise over a mountain path, without text or symbols.",
      textApprovedAt: "2026-07-13T08:00:00.000Z",
    });

    render(<MotivationAdminControls posts={[imagePost]} />);

    const imageQueue = screen.getByRole("region", { name: "Изображения" });
    expect(within(imageQueue).getByRole("img", { name: "Действовать без привязанности" })).toHaveAttribute("src", imagePost.imageUrl);
    expect(within(imageQueue).getByText(imagePost.imagePrompt!)).toBeInTheDocument();

    await user.selectOptions(within(imageQueue).getByLabelText("Стиль изображения для «Действовать без привязанности»"), "minimal_symbolism");
    await user.click(within(imageQueue).getByRole("button", { name: "Перегенерировать" }));
    expect(fetchMock).toHaveBeenLastCalledWith(
      expect.stringContaining("/admin/motivation/posts/post-1/regenerate-image"),
      expect.objectContaining({ body: JSON.stringify({ visualStyle: "minimal_symbolism" }) }),
    );

    await user.click(within(imageQueue).getByRole("button", { name: "Опубликовать" }));
    expect(fetchMock).toHaveBeenLastCalledWith(
      expect.stringContaining("/admin/motivation/posts/post-1/approve-image"),
      expect.objectContaining({ method: "POST", credentials: "include" }),
    );
  });

  it("sends a rejection reason and disables every action for the pending post", async () => {
    let resolveRequest: ((value: { ok: boolean; text: () => Promise<string> }) => void) | undefined;
    const fetchMock = vi.fn().mockImplementation(
      () => new Promise((resolve) => { resolveRequest = resolve; }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<MotivationAdminControls posts={[candidate()]} />);
    await user.type(screen.getByLabelText("Причина отклонения для «Действовать без привязанности»"), "Неточная атрибуция");
    await user.click(screen.getByRole("button", { name: "Отклонить" }));

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/admin/motivation/posts/post-1/reject"),
      expect.objectContaining({ body: JSON.stringify({ reason: "Неточная атрибуция" }) }),
    );
    expect(screen.getByRole("button", { name: "Одобрить текст" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Отклонение…" })).toBeDisabled();

    resolveRequest?.({ ok: true, text: async () => "" });
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
  });

  it("shows API errors next to the affected card", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 409, text: async () => "Текст уже обработан" }));
    const user = userEvent.setup();

    render(<MotivationAdminControls posts={[candidate()]} />);
    await user.click(screen.getByRole("button", { name: "Одобрить текст" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Текст уже обработан");
  });
});
