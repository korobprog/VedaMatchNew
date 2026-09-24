import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { WorkMemberDto } from "@vedamatch/shared";
import {
  TaskComposer,
  composerHasContent,
  emptyComposerDraft,
} from "./task-composer";

const members = [
  { userId: "me", name: "Станислав" },
  { userId: "other", name: "Маму" },
] as unknown as WorkMemberDto[];

function setup(initial = emptyComposerDraft("me")) {
  const onDraftChange = vi.fn();
  const onSubmit = vi.fn().mockResolvedValue(true);
  const onCancel = vi.fn();
  render(
    <TaskComposer
      columnName="Разное"
      members={members}
      viewerId="me"
      initialDraft={initial}
      onDraftChange={onDraftChange}
      onSubmit={onSubmit}
      onCancel={onCancel}
    />,
  );
  return { onDraftChange, onSubmit, onCancel };
}

describe("TaskComposer (VED-453)", () => {
  it("держит текст сам и отдаёт черновик наружу", async () => {
    const user = userEvent.setup();
    const { onDraftChange } = setup();

    await user.type(
      screen.getByLabelText("Описание новой задачи в разделе «Разное»"),
      "Кнопка не жмётся",
    );

    expect(onDraftChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ description: "Кнопка не жмётся" }),
    );
    expect(screen.getByText("«Кнопка не жмётся»")).toBeInTheDocument();
  });

  it("начинает с переданного черновика — начатое переживает сворачивание", () => {
    setup({ ...emptyComposerDraft("me"), description: "Начатое" });
    expect(
      screen.getByLabelText("Описание новой задачи в разделе «Разное»"),
    ).toHaveValue("Начатое");
  });

  it("Ctrl+Enter отправляет всё написанное", async () => {
    const user = userEvent.setup();
    const { onSubmit } = setup();

    await user.type(
      screen.getByLabelText("Описание новой задачи в разделе «Разное»"),
      "Сломался поиск{Control>}{Enter}{/Control}",
    );

    expect(onSubmit).toHaveBeenCalledWith({
      description: "Сломался поиск",
      title: null,
      files: [],
      assigneeId: "me",
      priority: "normal",
    });
  });

  it("пустое описание не отправляется, Escape закрывает", async () => {
    const user = userEvent.setup();
    const { onSubmit, onCancel } = setup();

    await user.click(screen.getByRole("button", { name: "Добавить" }));
    expect(onSubmit).not.toHaveBeenCalled();

    await user.type(
      screen.getByLabelText("Описание новой задачи в разделе «Разное»"),
      "{Escape}",
    );
    expect(onCancel).toHaveBeenCalled();
  });
});

describe("composerHasContent", () => {
  it("пустой черновик терять не жалко", () => {
    expect(composerHasContent(emptyComposerDraft("me"))).toBe(false);
    expect(
      composerHasContent({ ...emptyComposerDraft("me"), description: "  " }),
    ).toBe(false);
    expect(
      composerHasContent({ ...emptyComposerDraft("me"), description: "текст" }),
    ).toBe(true);
  });
});
