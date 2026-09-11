import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NoticeDto } from "@vedamatch/shared";
import { NoticeDetailView } from "./notice-detail-view";
import { deleteNotice, getNotice } from "@/lib/notices-api";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("next-intl", () => ({ useLocale: () => "ru" }));
vi.mock("@/lib/notices-api", () => ({
  NoticesApiError: class extends Error {},
  getNotice: vi.fn(),
  deleteNotice: vi.fn(),
  renewNotice: vi.fn(),
  setNoticeStatus: vi.fn(),
}));
// Отклики, жалоба и фото живут своей жизнью и в этих сценариях не нужны.
vi.mock("./notice-responses-panel", () => ({ NoticeResponsesPanel: () => null }));
vi.mock("./notice-report-dialog", () => ({ NoticeReportDialog: () => null }));
vi.mock("./notice-images-upload", () => ({ NoticeImagesUpload: () => null }));

function notice(over: Partial<NoticeDto> = {}): NoticeDto {
  return {
    id: "n1",
    kind: "offer",
    rubric: { id: "r1", slug: "help", titleRu: "Помощь", titleEn: "Help" },
    titleRu: "Отдам книги",
    titleEn: null,
    descriptionRu: "Бхагавад-гита, два тома",
    descriptionEn: null,
    audience: "everyone",
    city: null,
    country: null,
    lat: null,
    lon: null,
    placePrecision: "city",
    startsAt: null,
    endsAt: null,
    timeZone: null,
    venueName: null,
    isOnline: false,
    onlineUrl: null,
    repeat: "none",
    repeatUntil: null,
    status: "published",
    needsReview: false,
    primaryImageUrl: null,
    images: [],
    author: { id: "author", name: "Радха", avatarUrl: null },
    postedAs: null,
    publishedAt: "2026-09-10T10:00:00.000Z",
    expiresAt: "2026-10-10T10:00:00.000Z",
    resolvedAt: null,
    canRenew: false,
    viewsCount: 3,
    responsesCount: 0,
    thanksCount: 0,
    isMine: false,
    canDelete: false,
    ...over,
  } as NoticeDto;
}

beforeEach(() => {
  vi.mocked(deleteNotice).mockReset();
  vi.mocked(deleteNotice).mockResolvedValue(undefined);
  push.mockReset();
});

afterEach(() => vi.restoreAllMocks());

describe("NoticeDetailView — удаление (VED-42)", () => {
  it("does not offer deletion to a passer-by", async () => {
    vi.mocked(getNotice).mockResolvedValue(notice());
    render(<NoticeDetailView id="n1" />);

    await screen.findByText("Отдам книги");
    expect(screen.queryByRole("button", { name: /Удалить/ })).toBeNull();
  });

  it("lets a notices admin delete someone else's notice after confirming", async () => {
    vi.mocked(getNotice).mockResolvedValue(notice({ canDelete: true }));
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const user = userEvent.setup();
    render(<NoticeDetailView id="n1" />);

    await user.click(await screen.findByRole("button", { name: "Удалить объявление" }));

    expect(deleteNotice).toHaveBeenCalledWith("n1");
    expect(push).toHaveBeenCalledWith("/notices");
    // Кнопок автора у администратора нет: чужой текст он не правит.
    expect(screen.queryByRole("button", { name: "Скрыть" })).toBeNull();
  });

  // Удаление насовсем: раньше оно срабатывало с первого касания.
  it("keeps the notice when the confirmation is declined", async () => {
    vi.mocked(getNotice).mockResolvedValue(notice({ isMine: true, canDelete: true }));
    vi.spyOn(window, "confirm").mockReturnValue(false);
    const user = userEvent.setup();
    render(<NoticeDetailView id="n1" />);

    await user.click(await screen.findByRole("button", { name: "Удалить" }));

    expect(deleteNotice).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });

  it("lets the author delete their own notice", async () => {
    vi.mocked(getNotice).mockResolvedValue(notice({ isMine: true, canDelete: true }));
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const user = userEvent.setup();
    render(<NoticeDetailView id="n1" />);

    await user.click(await screen.findByRole("button", { name: "Удалить" }));

    expect(deleteNotice).toHaveBeenCalledWith("n1");
    expect(push).toHaveBeenCalledWith("/notices/my");
  });
});
