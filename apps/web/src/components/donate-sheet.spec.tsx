import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DonateButton } from "./donate-sheet";

describe("DonateButton", () => {
  it("renders nothing when donations are off or have no requisites", () => {
    const { container, rerender } = render(<DonateButton donation={null} />);
    expect(container).toBeEmptyDOMElement();

    rerender(<DonateButton donation={{ enabled: true, text: "", requisites: [] }} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders the button and the sheet with every requisite", () => {
    render(
      <DonateButton
        donation={{
          enabled: true,
          text: "Спасибо за поддержку",
          requisites: [
            { kind: "sbp", label: "СБП", value: "+7 900 000-00-00" },
            { kind: "link", label: "Boosty", value: "https://boosty.to/vedamatch" },
          ],
        }}
      />,
    );

    expect(screen.getByRole("button", { name: /Поддержать развитие VedaMatch/ })).toBeInTheDocument();
    expect(screen.getByText("Спасибо за поддержку")).toBeInTheDocument();
    expect(screen.getByText("+7 900 000-00-00")).toBeInTheDocument();
    // Содержимое закрытого <dialog> скрыто от дерева доступности, пока его не открыли.
    expect(screen.getByRole("link", { name: "Открыть", hidden: true })).toHaveAttribute(
      "href",
      "https://boosty.to/vedamatch",
    );
    expect(screen.getAllByRole("button", { name: "Копировать", hidden: true })).toHaveLength(1);
  });

  // VED-12: абзац «Генерация видео и картинок стоит реальных денег…» был
  // дефолтом, и заказчик вычеркнул его на скриншоте. Пустой текст обращения
  // означает «абзаца нет», а не подстановку старой фразы.
  it("shows no intro paragraph when the admin text is empty", () => {
    render(
      <DonateButton
        donation={{
          enabled: true,
          text: "",
          requisites: [{ kind: "card", label: "Карта", value: "2200" }],
        }}
      />,
    );

    expect(screen.queryByText(/Генерация видео и картинок/)).not.toBeInTheDocument();
  });

  // Банки под номером: перевод по телефону уходит в конкретный банк, и человек
  // должен видеть, в какой, ещё до приложения банка.
  it("shows the bank note under the value", () => {
    render(
      <DonateButton
        donation={{
          enabled: true,
          text: "",
          requisites: [
            {
              kind: "sbp",
              label: "Максим К.",
              value: "+7 900 000-00-00",
              note: "Сбербанк, ВТБ, Озон-банк",
            },
          ],
        }}
      />,
    );

    expect(screen.getByText("Сбербанк, ВТБ, Озон-банк")).toBeInTheDocument();
  });
});
