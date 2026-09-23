import type { ServiceCard as ServiceCardType } from "@vedamatch/shared";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { ServiceGrid } from "./service-grid";
import { effectiveMode, readLayout, writeLayout } from "@/lib/service-layout";

const USER = "u1";

function service(over: Partial<ServiceCardType> = {}): ServiceCardType {
  return {
    id: over.slug ?? "union",
    slug: "union",
    name: "Знакомства",
    nameEn: "Union",
    description: "Осознанные знакомства и сотрудничество",
    iconUrl: null,
    url: "/union",
    status: "active",
    category: "community",
    requiresDevoteeVerification: false,
    ...over,
  };
}

const SERVICES = [
  service(),
  service({
    id: "astro",
    slug: "astro",
    name: "Астрология",
    url: "/astro",
    description: "Ведическая карта рождения",
  }),
  service({
    id: "market",
    slug: "market",
    name: "Рынок",
    url: "/market",
    description: "Товары и услуги общины",
    status: "coming_soon",
  }),
];

const grid = () => <ServiceGrid services={SERVICES} userId={USER} />;

beforeEach(() => {
  localStorage.clear();
});

describe("ServiceGrid", () => {
  /**
   * Новичок обязан увидеть описания: по одному слову в плитке не понять,
   * что за сервис. Компактный режим включается только после знакомства.
   */
  it("до первого открытия сервиса показывает подробные карточки", () => {
    render(grid());
    expect(screen.getByText("Осознанные знакомства и сотрудничество")).toBeInTheDocument();
    // Открывает сервис его название: отдельной кнопки «Открыть» нет ни в
    // подробном виде, ни в компактном.
    expect(screen.getByRole("link", { name: /Знакомства/ })).toHaveAttribute(
      "href",
      "/union",
    );
    expect(screen.getByRole("link", { name: /Астрология/ })).toHaveAttribute(
      "href",
      "/astro",
    );
  });

  // VED-111: «Настроить кнопки» живёт в строке над сеткой, рядом с видом.
  it("ставит переданную кнопку в строку над сеткой, перед видом сервисов", () => {
    render(
      <ServiceGrid
        services={SERVICES}
        userId={USER}
        toolbarStart={<button type="button">Настроить кнопки</button>}
      />,
    );

    const settings = screen.getByRole("button", { name: "Настроить кнопки" });
    const view = screen.getByRole("group", { name: "Вид сервисов" });
    // Одна строка: у кнопки и переключателя общий ряд.
    expect(settings.closest("div.mb-3")).toBe(view.closest("div.mb-3"));
    expect(
      settings.compareDocumentPosition(view) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  // VED-127: «Изменить порядок» стоит сразу за «Кнопками», вид — справа.
  it("держит «Изменить порядок» рядом с настройкой кнопок, а вид — у правого края", () => {
    render(
      <ServiceGrid
        services={SERVICES}
        userId={USER}
        toolbarStart={<button type="button">Настроить кнопки</button>}
      />,
    );

    const settings = screen.getByRole("button", { name: "Настроить кнопки" });
    const reorder = screen.getByRole("button", { name: "Изменить порядок" });
    const view = screen.getByRole("group", { name: "Вид сервисов" });
    expect(settings.nextElementSibling).toBe(reorder);
    expect(reorder.nextElementSibling).toBe(view);
    expect(view).toHaveClass("ml-auto");
  });

  /**
   * VED-383: ряд не помещался в 320 точек и толкал вправо всю страницу, а за
   * правый край уезжал именно переключатель вида — настройка пропадала с
   * экрана. Перенос выбран вместо своей горизонтальной прокрутки: прокрутка
   * оставила бы переключатель за краем ровно так же.
   */
  it("переносит ряд настроек, а не растягивает страницу", () => {
    render(
      <ServiceGrid
        services={SERVICES}
        userId={USER}
        toolbarStart={<button type="button">Настроить кнопки</button>}
      />,
    );

    const view = screen.getByRole("group", { name: "Вид сервисов" });
    expect(view.closest("div.mb-3")).toHaveClass("flex-wrap");
  });

  // VED-383: подпись короткая, имя — полное, как у соседних «Кнопок».
  it("подписывает перестановку коротко, но называет её полностью", () => {
    render(grid());

    const reorder = screen.getByRole("button", { name: "Изменить порядок" });
    expect(reorder).toHaveTextContent("Порядок");
    // Подсказка называет и булавку: закрепляют теперь здесь (VED-401).
    expect(reorder).toHaveAttribute("title", "Изменить порядок и закрепить");
  });

  // VED-401: булавки на главной нет, закрепляют в режиме «Порядок».
  it("закрепляет карточку только из режима «Порядок»", async () => {
    const user = userEvent.setup();
    render(grid());

    expect(
      screen.queryByRole("button", { name: /Закрепить сверху/ }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Изменить порядок" }));
    await user.click(
      screen.getByRole("button", { name: "Закрепить сверху: Астрология" }),
    );

    expect(readLayout(USER).pinnedId).toBe("astro");
    const pinned = screen.getByRole("button", { name: "Открепить: Астрология" });
    expect(pinned).toHaveAttribute("aria-pressed", "true");
    // Закреплённая встаёт первой.
    expect(screen.getAllByRole("heading", { level: 3 })[0]).toHaveTextContent(
      "Астрология",
    );

    await user.click(pinned);
    expect(readLayout(USER).pinnedId).toBeNull();
  });

  it("передаёт кнопки шапки своей карточке", () => {
    render(
      <ServiceGrid
        services={SERVICES}
        userId={USER}
        extras={{ astro: { headerExtra: <a href="/astro/today">Сегодня</a> } }}
      />,
    );
    expect(screen.getByRole("link", { name: "Сегодня" })).toBeInTheDocument();
  });

  it("в компактном режиме описаний нет", () => {
    writeLayout(USER, { mode: "compact" });
    render(grid());

    expect(
      screen.queryByText("Осознанные знакомства и сотрудничество"),
    ).not.toBeInTheDocument();
    // Нажимается вся плитка целиком.
    expect(screen.getByRole("link", { name: /Знакомства/ })).toHaveAttribute(
      "href",
      "/union",
    );
  });

  it("переключатель меняет вид и запоминает выбор", async () => {
    const user = userEvent.setup();
    render(grid());

    await user.click(screen.getByRole("button", { name: "Плитками" }));

    // Вид различается описаниями: ссылка на сервис есть в обоих.
    expect(
      screen.queryByText("Осознанные знакомства и сотрудничество"),
    ).not.toBeInTheDocument();
    expect(readLayout(USER).mode).toBe("compact");

    await user.click(screen.getByRole("button", { name: "Подробно" }));
    expect(
      screen.getByText("Осознанные знакомства и сотрудничество"),
    ).toBeInTheDocument();
    expect(readLayout(USER).mode).toBe("detailed");
  });

  /**
   * Открытие сервиса — и есть то самое «знакомство состоялось», после
   * которого главная сжимается до плиток.
   */
  it("открытие сервиса переводит главную в компактный режим", async () => {
    const user = userEvent.setup();
    render(grid());

    await user.click(screen.getByRole("link", { name: /Знакомства/ }));

    expect(effectiveMode(readLayout(USER))).toBe("compact");
  });

  /**
   * Приглушения мало: по приглушённой ссылке всё равно тыкают, а потом
   * возвращаются с пустой страницы.
   */
  it("недоступный сервис в компактном режиме — не ссылка", () => {
    writeLayout(USER, { mode: "compact" });
    render(grid());

    const soon = screen.getByText(/Рынок/);
    expect(soon.closest("a")).toBeNull();
    expect(screen.getByText(/скоро/)).toBeInTheDocument();
  });

  /**
   * В плитке негде стоять ни ручке перетаскивания, ни стрелкам, поэтому
   * перестановка живёт только в подробном виде. Порядок при этом общий.
   */
  it("перестановку в компактном режиме не предлагает", () => {
    writeLayout(USER, { mode: "compact" });
    render(grid());
    expect(screen.queryByRole("button", { name: "Изменить порядок" })).toBeNull();
  });

  /**
   * Порядок общий: переставил карточки в подробном виде — плитки встали так
   * же. Два независимых порядка означали бы, что после переключения всё
   * оказывается не там, где человек это оставил.
   */
  it("порядок один на оба режима", async () => {
    const user = userEvent.setup();
    writeLayout(USER, { order: ["astro", "market", "union"], pinnedId: null });
    render(grid());

    const order = () =>
      screen
        .getAllByRole("link")
        .map((node) => node.getAttribute("href"))
        .filter((href): href is string => href !== null);

    // «Рынок» ещё не запущен: его название не ссылка ни в подробном виде, ни
    // в компактном — потому его нет ни в одном списке.
    expect(order()).toEqual(["/astro", "/union"]);

    await user.click(screen.getByRole("button", { name: "Плитками" }));
    expect(order()).toEqual(["/astro", "/union"]);
  });
});

describe("ServiceGrid badges", () => {
  it("счётчик виден в обоих режимах — в плитке он единственный сигнал", async () => {
    const user = userEvent.setup();
    render(
      <ServiceGrid
        services={SERVICES}
        userId={USER}
        extras={{ union: { badgeCount: 3 } }}
      />,
    );

    expect(screen.getByLabelText("Входящих заявок: 3")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Плитками" }));
    const tile = screen.getByRole("link", { name: /Знакомства/ });
    expect(within(tile).getByLabelText("Новое: 3")).toBeInTheDocument();
  });
});
