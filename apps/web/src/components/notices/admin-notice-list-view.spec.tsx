import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminNoticeListItemDto, AdminNoticeListResponse } from "@vedamatch/shared";
import { AdminNoticeListView } from "./admin-notice-list-view";
import { deleteNotice, getAdminNotices } from "@/lib/notices-api";

vi.mock("@/lib/notices-api", () => ({
  NoticesApiError: class extends Error {},
  getAdminNotices: vi.fn(),
  deleteNotice: vi.fn(),
}));

function item(over: Partial<AdminNoticeListItemDto> = {}): AdminNoticeListItemDto {
  return {
    id: "n1",
    title: "Отдам книги",
    status: "published",
    kind: "offer",
    authorName: "Радха",
    city: "Москва",
    createdAt: "2026-09-10T00:00:00.000Z",
    expiresAt: "2026-10-10T00:00:00.000Z",
    ...over,
  };
}

function response(
  items: AdminNoticeListItemDto[],
  over: Partial<AdminNoticeListResponse> = {},
): AdminNoticeListResponse {
  return { items, page: 1, pageSize: 20, total: items.length, totalPages: 1, ...over };
}

beforeEach(() => {
  vi.mocked(getAdminNotices).mockReset();
  vi.mocked(deleteNotice).mockReset();
  vi.mocked(deleteNotice).mockResolvedValue(undefined);
  vi.stubGlobal("confirm", vi.fn(() => true));
});

describe("AdminNoticeListView", () => {
  it("shows the loaded notices with status and author", async () => {
    vi.mocked(getAdminNotices).mockResolvedValue(response([item()]));
    render(<AdminNoticeListView />);

    expect(await screen.findByText("Отдам книги")).toBeInTheDocument();
    // «Опубликовано» встречается и в фильтре статуса — сузили до строки.
    const row = screen.getByRole("listitem");
    expect(within(row).getByText("Опубликовано")).toBeInTheDocument();
    expect(within(row).getByText(/автор Радха/)).toBeInTheDocument();
  });

  it("explains an empty result without filters as 'no notices yet'", async () => {
    vi.mocked(getAdminNotices).mockResolvedValue(response([]));
    render(<AdminNoticeListView />);
    expect(await screen.findByText("Объявлений пока нет.")).toBeInTheDocument();
  });

  it("deletes a notice only after confirmation, then removes it from the list", async () => {
    vi.mocked(getAdminNotices).mockResolvedValue(response([item()]));
    const user = userEvent.setup();
    render(<AdminNoticeListView />);
    await screen.findByText("Отдам книги");

    await user.click(
      screen.getByRole("button", { name: "Удалить объявление «Отдам книги»" }),
    );

    expect(window.confirm).toHaveBeenCalledWith(
      "Удалить объявление насовсем? Вместе с ним пропадут отклики и фотографии.",
    );
    expect(deleteNotice).toHaveBeenCalledWith("n1");
    await waitFor(() =>
      expect(screen.queryByText("Отдам книги")).not.toBeInTheDocument(),
    );
  });

  it("keeps the row when the confirmation is declined", async () => {
    vi.mocked(getAdminNotices).mockResolvedValue(response([item()]));
    vi.mocked(window.confirm).mockReturnValueOnce(false);
    const user = userEvent.setup();
    render(<AdminNoticeListView />);
    await screen.findByText("Отдам книги");

    await user.click(
      screen.getByRole("button", { name: "Удалить объявление «Отдам книги»" }),
    );

    expect(deleteNotice).not.toHaveBeenCalled();
    expect(screen.getByText("Отдам книги")).toBeInTheDocument();
  });

  it("shows a message and keeps the row when deletion fails", async () => {
    vi.mocked(getAdminNotices).mockResolvedValue(response([item()]));
    vi.mocked(deleteNotice).mockRejectedValue(new Error("нет прав"));
    const user = userEvent.setup();
    render(<AdminNoticeListView />);
    await screen.findByText("Отдам книги");

    await user.click(
      screen.getByRole("button", { name: "Удалить объявление «Отдам книги»" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent("Не получилось удалить");
    expect(screen.getByText("Отдам книги")).toBeInTheDocument();
  });

  it("paginates: 'Назад' is disabled on the first page, 'Вперёд' moves the request forward", async () => {
    vi.mocked(getAdminNotices).mockResolvedValue(
      response([item()], { page: 1, totalPages: 3, total: 45 }),
    );
    const user = userEvent.setup();
    render(<AdminNoticeListView />);
    await screen.findByText("Отдам книги");

    expect(screen.getByRole("button", { name: "Назад" })).toBeDisabled();
    const forward = screen.getByRole("button", { name: "Вперёд" });
    expect(forward).not.toBeDisabled();

    vi.mocked(getAdminNotices).mockResolvedValue(
      response([item({ id: "n2", title: "Вторая страница" })], {
        page: 2,
        totalPages: 3,
        total: 45,
      }),
    );
    await user.click(forward);

    await waitFor(() =>
      expect(getAdminNotices).toHaveBeenLastCalledWith(
        expect.objectContaining({ page: 2 }),
      ),
    );
  });

  it("searches by title or author, resetting to the first page", async () => {
    vi.mocked(getAdminNotices).mockResolvedValue(response([item()]));
    const user = userEvent.setup();
    render(<AdminNoticeListView />);
    await screen.findByText("Отдам книги");

    await user.type(
      screen.getByLabelText("Поиск объявлений по заголовку или автору"),
      "Радха",
    );

    await waitFor(() =>
      expect(getAdminNotices).toHaveBeenLastCalledWith(
        expect.objectContaining({ q: "Радха", page: 1 }),
      ),
    );
  });

  it("shows an explanation matching the active filters when nothing is found", async () => {
    vi.mocked(getAdminNotices).mockResolvedValue(response([]));
    const user = userEvent.setup();
    render(<AdminNoticeListView />);

    await user.type(
      screen.getByLabelText("Поиск объявлений по заголовку или автору"),
      "нет такого",
    );

    expect(
      await screen.findByText(/По таким фильтрам объявлений не нашлось/),
    ).toBeInTheDocument();
  });
});
