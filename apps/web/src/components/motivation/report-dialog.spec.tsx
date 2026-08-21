import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { ReportDialog } from "./report-dialog";

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

describe("ReportDialog", () => {
  it("sends the chosen reason and thanks the person", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ count: 1, hidden: false }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<ReportDialog postId="p1" />);

    await user.click(screen.getByRole("button", { name: "Пожаловаться" }));
    await user.click(screen.getByLabelText("Неверный источник цитаты"));
    await user.type(screen.getByLabelText(/Комментарий/), "Стиха нет в главе");
    await user.click(screen.getByRole("button", { name: "Отправить" }));

    await waitFor(() => expect(screen.getByText("Спасибо, мы посмотрим")).toBeInTheDocument());
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/motivation/posts/p1/report");
    expect(JSON.parse(String(init.body))).toEqual({
      reason: "wrong_source",
      comment: "Стиха нет в главе",
    });
  });

  it("keeps the form open and shows the server message on failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ message: "Это ваш собственный рилс" }),
      }),
    );
    const user = userEvent.setup();
    render(<ReportDialog postId="p1" />);

    await user.click(screen.getByRole("button", { name: "Пожаловаться" }));
    await user.click(screen.getByRole("button", { name: "Отправить" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Это ваш собственный рилс");
    expect(screen.getByRole("button", { name: "Отправить" })).toBeInTheDocument();
  });
});
