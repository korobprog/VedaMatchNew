import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NotificationItemDto } from "@vedamatch/shared";
import { NotificationList } from "./notification-list";

const { fetchInbox, markInboxRead, setUnreadCount } = vi.hoisted(() => ({
  fetchInbox: vi.fn(),
  markInboxRead: vi.fn(),
  setUnreadCount: vi.fn(),
}));

vi.mock("@/lib/notifications-api", () => ({ fetchInbox, markInboxRead }));
vi.mock("@/lib/notifications-unread", () => ({ setUnreadCount }));

function item(overrides: Partial<NotificationItemDto> = {}): NotificationItemDto {
  return {
    id: "n1",
    title: "Кадр готов",
    body: "Откройте студию",
    url: "/motivation/create?reel=r1",
    category: "motivation",
    createdAt: new Date().toISOString(),
    readAt: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  markInboxRead.mockResolvedValue({ ok: true });
});

describe("NotificationList", () => {
  it("не гасит весь список при открытии страницы", async () => {
    // Раньше страница помечала прочитанным всё разом, и уведомления пропадали
    // раньше, чем человек до них добирался.
    fetchInbox.mockResolvedValue({
      items: [item(), item({ id: "n2", title: "Ответ поддержки" })],
      unreadCount: 2,
    });

    render(<NotificationList />);

    expect(await screen.findByText("Кадр готов")).toBeInTheDocument();
    expect(screen.getByText("Ответ поддержки")).toBeInTheDocument();
    expect(markInboxRead).not.toHaveBeenCalled();
    expect(setUnreadCount).toHaveBeenCalledWith(2);
  });

  it("по клику помечает прочитанным только открытое уведомление", async () => {
    fetchInbox.mockResolvedValue({
      items: [item(), item({ id: "n2", title: "Ответ поддержки" })],
      unreadCount: 2,
    });
    const user = userEvent.setup();
    render(<NotificationList />);

    await user.click(await screen.findByText("Кадр готов"));

    expect(markInboxRead).toHaveBeenCalledWith(["n1"]);
    // Второе остаётся новым, а первое переезжает в «Прочитанное».
    await waitFor(() =>
      expect(
        within(screen.getByRole("region", { name: "Прочитанные" })).getByText("Кадр готов"),
      ).toBeInTheDocument(),
    );
    expect(
      within(screen.getByRole("region", { name: "Непрочитанные" })).getByText("Ответ поддержки"),
    ).toBeInTheDocument();
  });

  it("гасит всё разом только по кнопке", async () => {
    fetchInbox.mockResolvedValue({ items: [item(), item({ id: "n2" })], unreadCount: 2 });
    const user = userEvent.setup();
    render(<NotificationList />);

    await user.click(
      await screen.findByRole("button", { name: "Отметить все прочитанными" }),
    );

    expect(markInboxRead).toHaveBeenCalledWith();
    expect(setUnreadCount).toHaveBeenLastCalledWith(0);
    await waitFor(() =>
      expect(screen.queryByRole("region", { name: "Непрочитанные" })).not.toBeInTheDocument(),
    );
  });

  it("показывает прочитанное отдельным блоком", async () => {
    fetchInbox.mockResolvedValue({
      items: [item({ id: "n2", title: "Старое", readAt: new Date().toISOString() })],
      unreadCount: 0,
    });

    render(<NotificationList />);

    const read = await screen.findByRole("region", { name: "Прочитанные" });
    expect(within(read).getByText("Старое")).toBeInTheDocument();
    // Кнопки «отметить все» нет: гасить нечего.
    expect(
      screen.queryByRole("button", { name: "Отметить все прочитанными" }),
    ).not.toBeInTheDocument();
  });

  it("сообщает о сбое загрузки вместо пустого экрана", async () => {
    fetchInbox.mockRejectedValue(new Error("offline"));

    render(<NotificationList />);

    expect(await screen.findByText(/Не удалось загрузить/)).toBeInTheDocument();
  });

  it("подписывает объявления администрации", async () => {
    fetchInbox.mockResolvedValue({
      items: [item({ id: "n2", category: "announcements", title: "Плановые работы" })],
      unreadCount: 1,
    });
    render(<NotificationList />);

    // У остальных категорий отправитель ясен из текста, а объявление портала
    // приходит ниоткуда.
    expect(await screen.findByText("От администрации")).toBeInTheDocument();
  });

  it("не подписывает так всё подряд", async () => {
    fetchInbox.mockResolvedValue({ items: [item()], unreadCount: 1 });
    render(<NotificationList />);

    await screen.findByText("Кадр готов");
    expect(screen.queryByText("От администрации")).not.toBeInTheDocument();
  });

  it("даёт путь к истории новостей: уведомление живёт неделю, новости остаются", async () => {
    fetchInbox.mockResolvedValue({ items: [item()], unreadCount: 1 });
    render(<NotificationList />);

    expect(
      await screen.findByRole("link", { name: /Что нового/ }),
    ).toHaveAttribute("href", "/updates/news");
  });

  it("даёт этот путь и когда уведомлений нет — других с этой страницы нет вовсе", async () => {
    fetchInbox.mockResolvedValue({ items: [], unreadCount: 0 });
    render(<NotificationList />);

    await screen.findByText("Уведомлений нет");
    expect(
      screen.getByRole("link", { name: /Что нового/ }),
    ).toHaveAttribute("href", "/updates/news");
  });
});
