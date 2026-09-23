import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NotificationItemDto } from "@vedamatch/shared";
import { SCROLL_NAV_GUTTER } from "@/components/ui/scroll-nav-buttons";
import { NotificationHistory } from "./notification-history";

const { fetchInboxHistory, markInboxRead, setInboxItemRead, setUnreadCount } =
  vi.hoisted(() => ({
    fetchInboxHistory: vi.fn(),
    markInboxRead: vi.fn(),
    setInboxItemRead: vi.fn(),
    setUnreadCount: vi.fn(),
  }));

vi.mock("@/lib/notifications-api", () => ({
  fetchInboxHistory,
  markInboxRead,
  setInboxItemRead,
  // Лента импортируется ради карточки и тянет эти имена за собой.
  fetchInbox: vi.fn(),
}));
vi.mock("@/lib/notifications-unread", () => ({ setUnreadCount }));
// Полоса прокрутки сама прячется, пока листать нечего, а jsdom страницу не
// раскладывает — высота у неё нулевая. Проверяем, что полоса поставлена;
// как она себя ведёт, проверяет её собственный тест.
vi.mock("@/components/ui/scroll-nav-buttons", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components/ui/scroll-nav-buttons")>()),
  ScrollNavButtons: () => <div data-testid="scroll-nav" />,
}));

const today = (hour: number) => {
  const date = new Date();
  date.setHours(hour, 5, 0, 0);
  return date.toISOString();
};
const yesterday = (hour: number) => {
  const date = new Date();
  date.setDate(date.getDate() - 1);
  date.setHours(hour, 0, 0, 0);
  return date.toISOString();
};

function item(overrides: Partial<NotificationItemDto> = {}): NotificationItemDto {
  return {
    id: "n1",
    title: "Задачу вернули",
    body: "VED-380",
    url: "/work/planner/s?task=VED-380",
    category: "work",
    createdAt: yesterday(8),
    readAt: yesterday(9),
    contactAt: today(1),
    mark: "done",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  markInboxRead.mockResolvedValue({ ok: true });
  setInboxItemRead.mockImplementation((id: string, read: boolean) =>
    Promise.resolve({
      id,
      readAt: read ? new Date().toISOString() : null,
      unreadCount: 3,
    }),
  );
});

describe("NotificationHistory (VED-404)", () => {
  it("показывает прочитанное по дням контакта в порядке сервера", async () => {
    fetchInboxHistory.mockResolvedValue({
      items: [
        item(),
        item({ id: "n2", title: "Ответ поддержки", contactAt: yesterday(20) }),
      ],
      nextCursor: null,
    });

    render(<NotificationHistory />);

    const todayGroup = await screen.findByRole("region", { name: "Сегодня" });
    expect(within(todayGroup).getByText("Задачу вернули")).toBeInTheDocument();
    // Время на карточке — время контакта, а не прихода.
    expect(within(todayGroup).getByText("01:05")).toBeInTheDocument();
    const yesterdayGroup = screen.getByRole("region", { name: "Вчера" });
    expect(
      within(yesterdayGroup).getByText("Ответ поддержки"),
    ).toBeInTheDocument();
    expect(fetchInboxHistory).toHaveBeenCalledWith({ limit: 20 });
  });

  it("открытие — контакт: сервер узнаёт о нём", async () => {
    fetchInboxHistory.mockResolvedValue({ items: [item()], nextCursor: null });
    const user = userEvent.setup();
    render(<NotificationHistory />);

    await user.click(await screen.findByText("Задачу вернули"));

    expect(markInboxRead).toHaveBeenCalledWith(["n1"]);
  });

  it("вернуть в непрочитанные — карточка на месте, счётчик колокольчика свежий", async () => {
    fetchInboxHistory.mockResolvedValue({ items: [item()], nextCursor: null });
    const user = userEvent.setup();
    render(<NotificationHistory />);

    await user.click(
      await screen.findByRole("button", { name: "Вернуть в непрочитанные" }),
    );

    expect(setInboxItemRead).toHaveBeenCalledWith("n1", false);
    expect(
      screen.getByRole("button", { name: "Пометить прочитанным" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Задачу вернули")).toBeInTheDocument();
    await waitFor(() => expect(setUnreadCount).toHaveBeenCalledWith(3));
  });

  it("«Показать ещё» приклеивает порцию без дублей", async () => {
    fetchInboxHistory
      .mockResolvedValueOnce({ items: [item()], nextCursor: "c1" })
      .mockResolvedValueOnce({
        items: [
          item(),
          item({ id: "n3", title: "Новый отклик", contactAt: yesterday(7) }),
        ],
        nextCursor: null,
      });
    const user = userEvent.setup();
    render(<NotificationHistory />);

    await user.click(await screen.findByRole("button", { name: "Показать ещё" }));

    expect(await screen.findByText("Новый отклик")).toBeInTheDocument();
    expect(screen.getAllByText("Задачу вернули")).toHaveLength(1);
    expect(fetchInboxHistory).toHaveBeenLastCalledWith({
      cursor: "c1",
      limit: 20,
    });
    expect(
      screen.queryByRole("button", { name: "Показать ещё" }),
    ).not.toBeInTheDocument();
  });

  it("пустая история объясняет, что здесь появится", async () => {
    fetchInboxHistory.mockResolvedValue({ items: [], nextCursor: null });
    render(<NotificationHistory />);

    expect(await screen.findByText("История пока пуста")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "К новым уведомлениям" }),
    ).toHaveAttribute("href", "/notifications");
  });

  // VED-251: «примени такую же полоску в окне списка уведомлений».
  it("ставит полосу прокрутки и отодвигает от неё карточки на телефоне", async () => {
    fetchInboxHistory.mockResolvedValue({
      items: [item()],
      nextCursor: null,
    });

    render(<NotificationHistory />);

    expect(await screen.findByTestId("scroll-nav")).toBeInTheDocument();
    for (const name of ["Сегодня"]) {
      const region = screen.getByRole("region", { name });
      expect(region.className.split(/\s+/)).toContain(SCROLL_NAV_GUTTER);
    }
  });
});
