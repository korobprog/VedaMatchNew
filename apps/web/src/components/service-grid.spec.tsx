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
