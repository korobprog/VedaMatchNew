import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AssistantComposerHelper } from "./assistant-composer-helper";

const compose = vi.fn();
vi.mock("@/lib/assistant-client", () => ({
  composeWithAssistant: (input: unknown) => compose(input),
}));

afterEach(() => {
  compose.mockReset();
});

function setup() {
  const onInsert = vi.fn();
  const onSend = vi.fn().mockResolvedValue(undefined);
  const onClose = vi.fn();
  render(
    <AssistantComposerHelper
      recipientName="Кешава"
      context={["Кешава: Привет"]}
      onInsert={onInsert}
      onSend={onSend}
      onClose={onClose}
    />,
  );
  return { onInsert, onSend, onClose };
}

describe("AssistantComposerHelper", () => {
  it("составляет текст и отдаёт его в поле ввода", async () => {
    compose.mockResolvedValue({ text: "Привет, Кешава!", quota: {} });
    const { onInsert, onClose } = setup();
    const user = userEvent.setup();

    await user.type(screen.getByLabelText("Просьба ассистенту"), "поздоровайся");
    await user.click(screen.getByRole("button", { name: "Составить" }));

    await waitFor(() =>
      expect(screen.getByLabelText("Текст от ассистента")).toHaveValue("Привет, Кешава!"),
    );
    expect(compose).toHaveBeenCalledWith({
      text: "поздоровайся",
      recipientName: "Кешава",
      context: ["Кешава: Привет"],
    });

    await user.click(screen.getByRole("button", { name: "Вставить в поле" }));
    expect(onInsert).toHaveBeenCalledWith("Привет, Кешава!");
    expect(onClose).toHaveBeenCalled();
  });

  it("«Отправить» шлёт правленый текст тем же обработчиком, что и реплику", async () => {
    compose.mockResolvedValue({ text: "Черновик", quota: {} });
    const { onSend, onClose } = setup();
    const user = userEvent.setup();

    await user.type(screen.getByLabelText("Просьба ассистенту"), "напиши{Enter}");
    const draft = await screen.findByLabelText("Текст от ассистента");
    await user.clear(draft);
    await user.type(draft, "Поправленный");
    await user.click(screen.getByRole("button", { name: "Отправить" }));

    await waitFor(() => expect(onSend).toHaveBeenCalledWith("Поправленный"));
    expect(onClose).toHaveBeenCalled();
  });

  it("ошибка ассистента показывается, поле остаётся", async () => {
    compose.mockRejectedValue(new Error("Лимит на сегодня исчерпан"));
    setup();
    const user = userEvent.setup();

    await user.type(screen.getByLabelText("Просьба ассистенту"), "что-нибудь{Enter}");

    expect(await screen.findByText("Лимит на сегодня исчерпан")).toBeInTheDocument();
    expect(screen.queryByLabelText("Текст от ассистента")).not.toBeInTheDocument();
  });
});
