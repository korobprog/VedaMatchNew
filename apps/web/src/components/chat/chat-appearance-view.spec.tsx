import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { ChatColorTemplateDto } from "@vedamatch/shared";
import { ChatAppearanceView } from "./chat-appearance-view";

vi.mock("@/lib/chat-appearance-api", () => ({
  createColorTemplate: vi.fn(),
  updateColorTemplate: vi.fn(),
  deleteColorTemplate: vi.fn(),
}));

import {
  createColorTemplate,
  deleteColorTemplate,
} from "@/lib/chat-appearance-api";

const template: ChatColorTemplateDto = {
  id: "tpl-1",
  name: "Синий",
  bubbleMine: "#23F0C7",
  bubbleTheirs: "#1A1A2E",
  accent: "#5CCCCC",
  background: "#0A0614",
  createdAt: "2026-08-23T10:00:00.000Z",
  updatedAt: "2026-08-23T10:00:00.000Z",
};

describe("ChatAppearanceView", () => {
  it("показывает пустое состояние без шаблонов", () => {
    render(<ChatAppearanceView initialTemplates={[]} />);
    expect(screen.getByText(/пока нет шаблонов/i)).toBeInTheDocument();
  });

  it("показывает карточку существующего шаблона", () => {
    render(<ChatAppearanceView initialTemplates={[template]} />);
    expect(screen.getByText("Синий")).toBeInTheDocument();
  });

  it("создаёт шаблон по кнопке «Создать»", async () => {
    vi.mocked(createColorTemplate).mockResolvedValue({
      ...template,
      id: "tpl-2",
      name: "Новый шаблон",
    });
    const user = userEvent.setup();
    render(<ChatAppearanceView initialTemplates={[]} />);

    await user.click(screen.getByRole("button", { name: "Создать" }));
    await user.type(screen.getByLabelText("Название"), "Новый шаблон");
    await user.click(screen.getByRole("button", { name: "Сохранить" }));

    await waitFor(() => expect(createColorTemplate).toHaveBeenCalled());
    expect(screen.getByText("Новый шаблон")).toBeInTheDocument();
  });

  it("удаляет шаблон по кнопке «Удалить»", async () => {
    vi.mocked(deleteColorTemplate).mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    render(<ChatAppearanceView initialTemplates={[template]} />);

    await user.click(screen.getByRole("button", { name: "Удалить" }));

    await waitFor(() => expect(deleteColorTemplate).toHaveBeenCalledWith("tpl-1"));
    expect(screen.queryByText("Синий")).not.toBeInTheDocument();
  });
});
