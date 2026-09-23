import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NotificationItemDto } from "@vedamatch/shared";
import { NotificationList } from "./notification-list";

const { fetchInbox, markInboxRead, setInboxItemRead, setUnreadCount } =
  vi.hoisted(() => ({
    fetchInbox: vi.fn(),
    markInboxRead: vi.fn(),
    setInboxItemRead: vi.fn(),
    setUnreadCount: vi.fn(),
  }));

vi.mock("@/lib/notifications-api", () => ({
  fetchInbox,
  markInboxRead,
  setInboxItemRead,
}));
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
    mark: null,
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
      unreadCount: 0,
    }),
  );
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

  it("открытие прочитанного сообщает серверу о контакте (VED-404)", async () => {
    // Иначе в истории уведомлений оно так и осталось бы на дне прочтения.
    fetchInbox.mockResolvedValue({
      items: [item({ readAt: new Date().toISOString() })],
      unreadCount: 0,
    });
    const user = userEvent.setup();
    render(<NotificationList />);

    await user.click(await screen.findByText("Кадр готов"));

    expect(markInboxRead).toHaveBeenCalledWith(["n1"]);
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
    // Следом лента перечитывается: сервер погасил и то, до чего человек не
    // долистал, и прежний курсор указывает уже не туда (VED-267).
    fetchInbox
      .mockResolvedValueOnce({
        items: [item(), item({ id: "n2" })],
        unreadCount: 2,
        nextCursor: null,
      })
      .mockResolvedValue({
        items: [
          item({ readAt: new Date().toISOString() }),
          item({ id: "n2", readAt: new Date().toISOString() }),
        ],
        unreadCount: 0,
        nextCursor: null,
      });
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

  // VED-152: ссылка из комментария одним словом шире карточки растягивала
  // страницу, и плеер внизу уезжал за край экрана.
  it("переносит длинную ссылку в тексте, а не растягивает страницу", async () => {
    const body = "Маму Тхакур дас: Сделано — https://github.com/korobprog/VedaMatchNew/pull/324, ждёт влития.";
    fetchInbox.mockResolvedValue({ items: [item({ body })], unreadCount: 1 });
    render(<NotificationList />);

    expect(await screen.findByText(body)).toHaveClass("break-words");
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

  /**
   * VED-272: доска «Работа» возвращает задачу в ленту после каждой смены
   * статуса, и без пометки её приходится открывать заново, только чтобы
   * понять, что изменилось.
   */
  it("показывает значок состояния задачи", async () => {
    fetchInbox.mockResolvedValue({
      items: [item({ title: "VED-42: новый комментарий", mark: "rework" })],
      unreadCount: 1,
    });
    render(<NotificationList />);

    // Скринридеру значок читается целой фразой, а не голым словом.
    expect(await screen.findByText("Статус: На доработку")).toBeInTheDocument();
    // Смысл несёт не только цвет: рядом со словом стоит свой знак.
    expect(screen.getByText("На доработку")).toBeInTheDocument();
  });

  /** VED-298: комментарий к задаче без состояния — цветной «Комментарий». */
  it("показывает значок «Комментарий» у комментария без состояния задачи", async () => {
    fetchInbox.mockResolvedValue({
      items: [item({ title: "VED-42: новый комментарий", mark: "comment" })],
      unreadCount: 1,
    });
    render(<NotificationList />);

    expect(await screen.findByText("Статус: Комментарий")).toBeInTheDocument();
    expect(
      screen.getByText("Комментарий").parentElement?.className,
    ).toMatch(/text-mark-comment/);
  });

  it("уведомление без состояния идёт без значка", async () => {
    fetchInbox.mockResolvedValue({ items: [item()], unreadCount: 1 });
    render(<NotificationList />);

    await screen.findByText("Кадр готов");
    expect(screen.queryByText(/^Статус: /)).not.toBeInTheDocument();
  });

  /**
   * Прочитанное раньше гасилось `opacity-70` целиком: подписи падали до
   * 2,9:1 вместо 4,5:1, а с ними погас бы и значок состояния — тот самый,
   * который просили сделать заметным.
   */
  it("не гасит прочитанное прозрачностью", async () => {
    fetchInbox.mockResolvedValue({
      items: [item({ readAt: new Date().toISOString(), mark: "done" })],
      unreadCount: 0,
    });
    render(<NotificationList />);

    const card = (await screen.findByText("Кадр готов")).closest("a");
    expect(card?.className).not.toMatch(/opacity-/);
    expect(screen.getByText("Статус: Выполнено")).toBeInTheDocument();
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

/**
 * VED-267: лента приходит порциями, а поиск идёт на сервере. Заказчик просил
 * и то, и другое: «переход в уведомления очень сильно тормозит… может какую-то
 * часть спрятать… сделай поиск».
 */
describe("NotificationList: страницы и поиск (VED-267)", () => {
  /**
   * Размер порции веб называет всегда. Молчание — это просьба отдать ленту
   * целиком, и так API отвечает сборкам приложения, которые не умеют просить
   * продолжение: незаметно перейти на молчание значило бы вернуть двести
   * карточек разом.
   */
  it("первым запросом просит первую порцию и называет её размер", async () => {
    fetchInbox.mockResolvedValue({ items: [item()], unreadCount: 1, nextCursor: null });

    render(<NotificationList />);

    await screen.findByText("Кадр готов");
    expect(fetchInbox).toHaveBeenCalledWith({ query: "", limit: 20 });
  });

  it("кнопки «показать ещё» нет, когда лента кончилась", async () => {
    fetchInbox.mockResolvedValue({ items: [item()], unreadCount: 1, nextCursor: null });

    render(<NotificationList />);

    await screen.findByText("Кадр готов");
    expect(screen.queryByRole("button", { name: "Показать ещё" })).not.toBeInTheDocument();
  });

  it("подгружает следующую порцию по курсору и приклеивает её к списку", async () => {
    fetchInbox
      .mockResolvedValueOnce({ items: [item()], unreadCount: 3, nextCursor: "курсор-1" })
      .mockResolvedValueOnce({
        items: [item({ id: "n2", title: "Ответ поддержки" })],
        unreadCount: 3,
        nextCursor: null,
      });
    const user = userEvent.setup();
    render(<NotificationList />);

    await user.click(await screen.findByRole("button", { name: "Показать ещё" }));

    expect(fetchInbox).toHaveBeenLastCalledWith({ query: "", cursor: "курсор-1" });
    expect(await screen.findByText("Ответ поддержки")).toBeInTheDocument();
    // Первая порция никуда не делась.
    expect(screen.getByText("Кадр готов")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Показать ещё" })).not.toBeInTheDocument(),
    );
  });

  it("счётчик «Новое» показывает всё непрочитанное, а не длину порции", async () => {
    fetchInbox.mockResolvedValue({ items: [item()], unreadCount: 190, nextCursor: "ещё" });

    render(<NotificationList />);

    expect(await screen.findByText("Новое · 190")).toBeInTheDocument();
  });

  it("сбой подгрузки не стирает уже показанное", async () => {
    fetchInbox
      .mockResolvedValueOnce({ items: [item()], unreadCount: 1, nextCursor: "курсор-1" })
      .mockRejectedValueOnce(new Error("offline"));
    const user = userEvent.setup();
    render(<NotificationList />);

    await user.click(await screen.findByRole("button", { name: "Показать ещё" }));

    expect(await screen.findByText(/Не удалось загрузить продолжение/)).toBeInTheDocument();
    expect(screen.getByText("Кадр готов")).toBeInTheDocument();
  });

  it("отправляет запрос поиска на сервер, а не фильтрует загруженное", async () => {
    fetchInbox.mockResolvedValue({ items: [item()], unreadCount: 1, nextCursor: null });
    const user = userEvent.setup();
    render(<NotificationList />);
    await screen.findByText("Кадр готов");

    await user.type(screen.getByLabelText("Поиск по уведомлениям"), "кадр");

    await waitFor(() =>
      expect(fetchInbox).toHaveBeenLastCalledWith({ query: "кадр", limit: 20 }),
    );
  });

  it("пустой запрос возвращает обычную ленту", async () => {
    fetchInbox.mockResolvedValue({ items: [item()], unreadCount: 1, nextCursor: null });
    const user = userEvent.setup();
    render(<NotificationList />);
    const field = await screen.findByLabelText("Поиск по уведомлениям");

    await user.type(field, "кадр");
    await waitFor(() =>
      expect(fetchInbox).toHaveBeenLastCalledWith({ query: "кадр", limit: 20 }),
    );
    await user.click(screen.getByRole("button", { name: "Очистить поиск" }));

    await waitFor(() =>
      expect(fetchInbox).toHaveBeenLastCalledWith({ query: "", limit: 20 }),
    );
  });

  it("на пустую выдачу отвечает словами, а не пустым экраном", async () => {
    fetchInbox
      .mockResolvedValueOnce({ items: [item()], unreadCount: 1, nextCursor: null })
      .mockResolvedValue({ items: [], unreadCount: 1, nextCursor: null });
    const user = userEvent.setup();
    render(<NotificationList />);
    await screen.findByText("Кадр готов");

    await user.type(screen.getByLabelText("Поиск по уведомлениям"), "мридангa");

    expect(await screen.findByText("Ничего не нашлось")).toBeInTheDocument();
    // Не «уведомлений нет»: у человека они есть, просто не по этому запросу.
    expect(screen.queryByText("Уведомлений нет")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Показать все уведомления" }),
    ).toBeInTheDocument();
  });

  it("подгрузка в выдаче поиска продолжает тот же запрос", async () => {
    fetchInbox
      .mockResolvedValueOnce({ items: [item()], unreadCount: 1, nextCursor: null })
      .mockResolvedValueOnce({
        items: [item({ id: "n3", title: "VED-267: поиск" })],
        unreadCount: 1,
        nextCursor: "курсор-2",
      })
      .mockResolvedValueOnce({
        items: [item({ id: "n4", title: "VED-267: страницы" })],
        unreadCount: 1,
        nextCursor: null,
      });
    const user = userEvent.setup();
    render(<NotificationList />);
    await screen.findByText("Кадр готов");

    await user.type(screen.getByLabelText("Поиск по уведомлениям"), "ved-267");
    await screen.findByText("VED-267: поиск");
    await user.click(screen.getByRole("button", { name: "Показать ещё" }));

    expect(fetchInbox).toHaveBeenLastCalledWith({
      query: "ved-267",
      cursor: "курсор-2",
    });
    expect(await screen.findByText("VED-267: страницы")).toBeInTheDocument();
  });
});

/**
 * VED-143: своя отметка у каждого уведомления. Заказчик видел на своей ленте
 * только «Отметить все прочитанными» — оптом, — а разбирать ленту нужно по
 * одному и с возможностью передумать.
 */
describe("NotificationList: своя отметка у карточки (VED-143)", () => {
  it("помечает прочитанным одно уведомление и не трогает соседнее", async () => {
    fetchInbox.mockResolvedValue({
      items: [item(), item({ id: "n2", title: "Ответ поддержки" })],
      unreadCount: 2,
    });
    const user = userEvent.setup();
    render(<NotificationList />);
    await screen.findByText("Кадр готов");

    const buttons = screen.getAllByRole("button", {
      name: "Пометить прочитанным",
    });
    await user.click(buttons[0]);

    expect(setInboxItemRead).toHaveBeenCalledWith("n1", true);
    // У соседней карточки подпись не изменилась.
    expect(
      screen.getAllByRole("button", { name: "Пометить прочитанным" }),
    ).toHaveLength(1);
    expect(
      screen.getByRole("button", { name: "Вернуть в непрочитанные" }),
    ).toBeInTheDocument();
  });

  it("отмеченная карточка остаётся на месте, а не прыгает вниз", async () => {
    // Уехав в «Прочитанное», она уносит с собой и кнопку отката: проверить,
    // что нажал, и исправить промах становится нечем.
    fetchInbox.mockResolvedValue({
      items: [item(), item({ id: "n2", title: "Ответ поддержки" })],
      unreadCount: 2,
    });
    const user = userEvent.setup();
    render(<NotificationList />);
    await screen.findByText("Кадр готов");

    await user.click(
      screen.getAllByRole("button", { name: "Пометить прочитанным" })[0],
    );

    const unread = screen.getByRole("region", { name: "Непрочитанные" });
    expect(within(unread).getByText("Кадр готов")).toBeInTheDocument();
    expect(
      screen.queryByRole("region", { name: "Прочитанные" }),
    ).not.toBeInTheDocument();
  });

  it("возвращает уведомление в непрочитанные", async () => {
    fetchInbox.mockResolvedValue({
      items: [item({ readAt: new Date().toISOString() })],
      unreadCount: 0,
    });
    const user = userEvent.setup();
    render(<NotificationList />);

    await user.click(
      await screen.findByRole("button", { name: "Вернуть в непрочитанные" }),
    );

    expect(setInboxItemRead).toHaveBeenCalledWith("n1", false);
    expect(
      screen.getByRole("button", { name: "Пометить прочитанным" }),
    ).toBeInTheDocument();
  });

  it("счётчик «Новое» и колокольчик меняются сразу, без перезагрузки", async () => {
    fetchInbox.mockResolvedValue({
      items: [item(), item({ id: "n2", title: "Ответ поддержки" })],
      unreadCount: 37,
    });
    setInboxItemRead.mockResolvedValue({
      id: "n1",
      readAt: new Date().toISOString(),
      unreadCount: 36,
    });
    const user = userEvent.setup();
    render(<NotificationList />);
    await screen.findByText("Новое · 37");

    await user.click(
      screen.getAllByRole("button", { name: "Пометить прочитанным" })[0],
    );

    expect(await screen.findByText("Новое · 36")).toBeInTheDocument();
    expect(setUnreadCount).toHaveBeenLastCalledWith(36);
    // Ленту при этом не перечитываем: курсор остаётся годным (VED-267).
    expect(fetchInbox).toHaveBeenCalledTimes(1);
  });

  it("точное число от сервера перебивает арифметику клиента", async () => {
    // Пока человек нажимал, в другой вкладке пришло новое уведомление.
    fetchInbox.mockResolvedValue({ items: [item()], unreadCount: 37 });
    setInboxItemRead.mockResolvedValue({
      id: "n1",
      readAt: new Date().toISOString(),
      unreadCount: 40,
    });
    const user = userEvent.setup();
    render(<NotificationList />);
    await screen.findByText("Новое · 37");

    await user.click(
      screen.getByRole("button", { name: "Пометить прочитанным" }),
    );

    expect(await screen.findByText("Новое · 40")).toBeInTheDocument();
  });

  it("сбой сервера откатывает и карточку, и счётчик", async () => {
    fetchInbox.mockResolvedValue({ items: [item()], unreadCount: 37 });
    setInboxItemRead.mockRejectedValue(new Error("offline"));
    const user = userEvent.setup();
    render(<NotificationList />);
    await screen.findByText("Новое · 37");

    await user.click(
      screen.getByRole("button", { name: "Пометить прочитанным" }),
    );

    expect(await screen.findByText(/Не удалось изменить отметку/)).toBeInTheDocument();
    expect(screen.getByText("Новое · 37")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Пометить прочитанным" }),
    ).toBeInTheDocument();
  });

  it("подгрузка следующей порции после отметки продолжает с того же курсора", async () => {
    fetchInbox
      .mockResolvedValueOnce({
        items: [item()],
        unreadCount: 37,
        nextCursor: "курсор-1",
      })
      .mockResolvedValueOnce({
        items: [item({ id: "n2", title: "Вторая порция" })],
        unreadCount: 36,
        nextCursor: null,
      });
    const user = userEvent.setup();
    render(<NotificationList />);
    await screen.findByText("Кадр готов");

    await user.click(
      screen.getByRole("button", { name: "Пометить прочитанным" }),
    );
    await user.click(screen.getByRole("button", { name: "Показать ещё" }));

    expect(fetchInbox).toHaveBeenLastCalledWith({
      query: "",
      cursor: "курсор-1",
    });
    expect(await screen.findByText("Вторая порция")).toBeInTheDocument();
    // Удержание пережило подгрузку: отмеченная карточка всё там же.
    expect(
      within(screen.getByRole("region", { name: "Непрочитанные" })).getByText(
        "Кадр готов",
      ),
    ).toBeInTheDocument();
  });

  it("«Отметить все прочитанными» осталось на месте", async () => {
    fetchInbox.mockResolvedValue({ items: [item()], unreadCount: 1 });
    render(<NotificationList />);

    expect(
      await screen.findByRole("button", { name: "Отметить все прочитанными" }),
    ).toBeInTheDocument();
  });
});
