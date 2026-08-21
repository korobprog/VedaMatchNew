import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MotivationAdminReelDto, MotivationAdminReelsResponse } from "@vedamatch/shared";
import { ReelsBoard } from "./reels-board";

const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const stats = { checked: 5, approved: 3, rejected: 1, escalated: 1, errors: 0, overridden: 2 };

function reel(overrides: Partial<MotivationAdminReelDto> = {}): MotivationAdminReelDto {
  return {
    id: "post-1",
    slug: "reel-1",
    stage: "rejected",
    reviewStatus: "rejected",
    createdAt: "2026-08-20T09:00:00.000Z",
    authorId: "user-1",
    authorName: "Пётр",
    authorPolicy: null,
    sourceVerified: false,
    quoteText: "Скидка на курсы",
    imageUrl: "",
    likeCount: 0,
    aiVerdict: {
      action: "ai_reject",
      decision: "reject",
      resolved: "reject",
      confidence: 0.92,
      flags: ["advertising"],
      reason: "Это реклама.",
      createdAt: "2026-08-20T09:01:00.000Z",
    },
    appeal: null,
    rejectionReason: "Это реклама.",
    ...overrides,
  };
}

function data(items: MotivationAdminReelDto[]): MotivationAdminReelsResponse {
  return { items, stats };
}

beforeEach(() => {
  refresh.mockClear();
  vi.restoreAllMocks();
});

describe("ReelsBoard", () => {
  it("offers to run the AI check again after a model failure", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(
      <ReelsBoard
        data={data([
          reel({
            stage: "admin_review",
            reviewStatus: "text_review",
            aiVerdict: {
              action: "ai_error",
              decision: null,
              resolved: null,
              confidence: null,
              flags: [],
              reason: "Провайдер модели временно недоступен",
              createdAt: "2026-08-20T09:01:00.000Z",
            },
          }),
        ])}
        filter="all"
      />,
    );

    await user.click(screen.getByRole("button", { name: /Проверить ИИ ещё раз/ }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/admin/motivation/reels/post-1/recheck"),
        expect.objectContaining({ method: "POST" }),
      ),
    );
  });

  it("keeps the recheck button away from a reel the model actually judged", () => {
    render(
      <ReelsBoard
        data={data([reel({ stage: "admin_review", reviewStatus: "text_review" })])}
        filter="all"
      />,
    );

    expect(
      screen.queryByRole("button", { name: /Проверить ИИ ещё раз/ }),
    ).not.toBeInTheDocument();
  });

  it("shows today's AI counters and the verdict behind a rejection", () => {
    render(<ReelsBoard data={data([reel()])} filter="all" />);

    const counters = screen.getByRole("region", { name: "Решения ИИ за сегодня" });
    expect(within(counters).getByText("5")).toBeInTheDocument();
    expect(within(counters).getByText("отменено вами")).toBeInTheDocument();
    expect(screen.getByText(/ИИ · отклонил · reject · 0.92/)).toBeInTheDocument();
    expect(screen.getByText(/флаги: advertising/)).toBeInTheDocument();
    expect(screen.getByText("Это реклама.")).toBeInTheDocument();
  });

  it("restores a rejected reel and refreshes the list", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => "{}" });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<ReelsBoard data={data([reel()])} filter="all" />);

    await user.click(screen.getByRole("button", { name: "Отменить отказ" }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/admin/motivation/reels/post-1/restore"),
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("asks for a reason before hiding a published reel", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => "{}" });
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("prompt", vi.fn().mockReturnValue("Не по теме"));
    const user = userEvent.setup();
    render(<ReelsBoard data={data([reel({ stage: "published" })])} filter="all" />);

    await user.click(screen.getByRole("button", { name: "Снять с публикации" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/admin/motivation/reels/post-1/hide");
    expect(JSON.parse(String(init.body))).toEqual({ reason: "Не по теме" });
  });

  it("does not hide when the reason prompt is cancelled", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("prompt", vi.fn().mockReturnValue(null));
    const user = userEvent.setup();
    render(<ReelsBoard data={data([reel({ stage: "published" })])} filter="all" />);

    await user.click(screen.getByRole("button", { name: "Снять с публикации" }));

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("opens the author policy form on demand", async () => {
    const user = userEvent.setup();
    render(<ReelsBoard data={data([reel({ authorPolicy: { dailyLimit: 3, trusted: true, blocked: false, note: null } })])} filter="all" />);

    expect(screen.getByText("доверенный")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Правила автора" }));

    expect(screen.getByLabelText(/Личный лимит в день/)).toHaveValue(3);
    expect(screen.getByLabelText(/Доверенный автор/)).toBeChecked();
  });

  it("explains an empty list", () => {
    render(<ReelsBoard data={data([])} filter="waiting" />);
    expect(screen.getByText(/Здесь пока пусто/)).toBeInTheDocument();
  });
});
