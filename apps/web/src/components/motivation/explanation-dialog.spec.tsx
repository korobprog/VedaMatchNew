import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { ExplanationDialog } from "./explanation-dialog";

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

describe("ExplanationDialog", () => {
  it("отправляет трактовку и отдаёт её вместе с именем автора", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        explanation: "О долге без расчёта на плоды.",
        explanationAuthor: { id: "u1", name: "Мадхава" },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const onAdded = vi.fn();
    const user = userEvent.setup();
    render(<ExplanationDialog postId="p1" onAdded={onAdded} />);

    await user.click(screen.getByRole("button", { name: "Добавить пояснение" }));
    await user.type(
      screen.getByLabelText("Текст пояснения"),
      "О долге без расчёта на плоды.",
    );
    await user.click(screen.getByRole("button", { name: "Опубликовать" }));

    await waitFor(() => expect(onAdded).toHaveBeenCalled());
    // Показать пояснение должен тот же экран, что его принял: ждать
    // перезагрузки ленты человеку незачем.
    expect(onAdded).toHaveBeenCalledWith({
      text: "О долге без расчёта на плоды.",
      author: { id: "u1", name: "Мадхава" },
    });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/motivation/posts/p1/explanation");
    expect(JSON.parse(String(init.body))).toEqual({
      text: "О долге без расчёта на плоды.",
    });
  });

  it("пустое пояснение отправить нельзя", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<ExplanationDialog postId="p1" onAdded={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Добавить пояснение" }));
    // Одни пробелы — то же самое, что пусто.
    await user.type(screen.getByLabelText("Текст пояснения"), "   ");

    expect(screen.getByRole("button", { name: "Опубликовать" })).toBeDisabled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("отказ сервера показывает его словами, не роняя написанное", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({
          message: "У этого афоризма пояснение уже есть",
        }),
      }),
    );
    const onAdded = vi.fn();
    const user = userEvent.setup();
    render(<ExplanationDialog postId="p1" onAdded={onAdded} />);

    await user.click(screen.getByRole("button", { name: "Добавить пояснение" }));
    await user.type(screen.getByLabelText("Текст пояснения"), "Моя мысль");
    await user.click(screen.getByRole("button", { name: "Опубликовать" }));

    await waitFor(() =>
      expect(
        screen.getByText("У этого афоризма пояснение уже есть"),
      ).toBeInTheDocument(),
    );
    expect(onAdded).not.toHaveBeenCalled();
    // Написанное осталось: переписывать его заново — наказание за чужую гонку.
    expect(screen.getByLabelText("Текст пояснения")).toHaveValue("Моя мысль");
  });
});
