import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { FeaturedServicesEditor } from "./featured-services-editor";
import { HOME_FEATURED_COOKIE, parseHomeFeatured } from "@/lib/home-featured";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

// jsdom не реализует showModal: без заглушки диалог не открывается и его
// содержимое остаётся скрытым от дерева доступности.
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function close() {
    this.open = false;
  };
});

afterEach(() => {
  document.cookie = `${HOME_FEATURED_COOKIE}=; path=/; max-age=0`;
  refresh.mockClear();
});

const OPTIONS = [
  { key: "chat", name: "Общение" },
  { key: "calls", name: "Звонки" },
  { key: "music", name: "Музыка" },
  { key: "library", name: "Образование" },
];

function savedChoice(): string[] | null {
  const raw = document.cookie
    .split("; ")
    .find((part) => part.startsWith(`${HOME_FEATURED_COOKIE}=`))
    ?.slice(HOME_FEATURED_COOKIE.length + 1);
  return parseHomeFeatured(raw, "u1");
}

describe("FeaturedServicesEditor", () => {
  it("saves the chosen services and redraws the home page", async () => {
    const user = userEvent.setup();
    render(
      <FeaturedServicesEditor
        userId="u1"
        current={["chat", "music", "calls"]}
        options={OPTIONS}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Настроить кнопки" }));
    await user.selectOptions(
      screen.getByLabelText("Вторая кнопка"),
      "Образование",
    );
    await user.click(screen.getByRole("button", { name: "Сохранить" }));

    expect(savedChoice()).toEqual(["chat", "library", "calls"]);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  // Выбор уже стоящего сервиса меняет кнопки местами, а не дублирует его.
  it("swaps two buttons instead of showing one service twice", async () => {
    const user = userEvent.setup();
    render(
      <FeaturedServicesEditor
        userId="u1"
        current={["chat", "music", "calls"]}
        options={OPTIONS}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Настроить кнопки" }));
    await user.selectOptions(screen.getByLabelText("Первая кнопка"), "Звонки");

    expect(screen.getByLabelText<HTMLSelectElement>("Первая кнопка").value).toBe(
      "calls",
    );
    expect(screen.getByLabelText<HTMLSelectElement>("Третья кнопка").value).toBe(
      "chat",
    );
  });

  it("forgets the choice when asked to bring the defaults back", async () => {
    document.cookie = `${HOME_FEATURED_COOKIE}=u1%7Clibrary%2Cchat%2Cmusic; path=/`;
    const user = userEvent.setup();
    render(
      <FeaturedServicesEditor
        userId="u1"
        current={["library", "chat", "music"]}
        options={OPTIONS}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Настроить кнопки" }));
    await user.click(
      screen.getByRole("button", { name: "Вернуть кнопки по умолчанию" }),
    );

    expect(savedChoice()).toBeNull();
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("drops a cancelled edit", async () => {
    const user = userEvent.setup();
    render(
      <FeaturedServicesEditor
        userId="u1"
        current={["chat", "music", "calls"]}
        options={OPTIONS}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Настроить кнопки" }));
    await user.selectOptions(
      screen.getByLabelText("Вторая кнопка"),
      "Образование",
    );
    await user.click(screen.getByRole("button", { name: "Отмена" }));
    await user.click(screen.getByRole("button", { name: "Настроить кнопки" }));

    expect(screen.getByLabelText<HTMLSelectElement>("Вторая кнопка").value).toBe(
      "music",
    );
    expect(savedChoice()).toBeNull();
  });

  // Нечего выбирать — нечего и настраивать.
  it("hides the settings when every service is already on a button", () => {
    render(
      <FeaturedServicesEditor
        userId="u1"
        current={["chat", "music"]}
        options={OPTIONS.slice(0, 2)}
      />,
    );
    expect(screen.queryByRole("button", { name: "Настроить кнопки" })).toBeNull();
  });
});
