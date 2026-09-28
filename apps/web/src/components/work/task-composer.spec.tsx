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
      "КНОПКА не жмётся",
    );

    expect(onDraftChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ description: "КНОПКА не жмётся" }),
    );
    expect(screen.getByText("«Кнопка»")).toBeInTheDocument();
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
      "Сломался ПОИСК{Control>}{Enter}{/Control}",
    );

    expect(onSubmit).toHaveBeenCalledWith({
      description: "Сломался ПОИСК",
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

  /* VED-637: заголовок — только из слов ЗАГЛАВНЫМИ. Нет выделения — нет
     заголовка, и задача не заводится, пока его не выделят или не впишут. */
  it("без выделения подсказывает и не отправляет", async () => {
    const user = userEvent.setup();
    const { onSubmit } = setup();
    const description = screen.getByLabelText(
      "Описание новой задачи в разделе «Разное»",
    );

    await user.type(description, "Сломался поиск{Control>}{Enter}{/Control}");

    expect(onSubmit).not.toHaveBeenCalled();
    const add = screen.getByRole("button", { name: "Добавить" });
    expect(add).toBeDisabled();
    expect(add).toHaveAccessibleDescription(
      "Выделите БОЛЬШИМИ буквами слова для заголовка",
    );

    await user.clear(description);
    await user.type(description, "Сломался ПОИСК");
    expect(add).toBeEnabled();
    expect(screen.getByText("«Поиск»")).toBeInTheDocument();
  });

  it("без выделения заголовок можно вписать руками", async () => {
    const user = userEvent.setup();
    const { onSubmit } = setup();
    await user.type(
      screen.getByLabelText("Описание новой задачи в разделе «Разное»"),
      "Сломался поиск",
    );

    await user.click(screen.getByRole("button", { name: "Вписать вручную" }));
    const title = screen.getByLabelText("Заголовок");
    expect(title).toHaveFocus();
    expect(screen.getByRole("button", { name: "Добавить" })).toBeDisabled();

    await user.type(title, "Поиск по доске");
    await user.click(screen.getByRole("button", { name: "Добавить" }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        description: "Сломался поиск",
        title: "Поиск по доске",
      }),
    );
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

  /* VED-488: ✖ в поле заголовка стирает его одним нажатием и оставляет
     курсор в поле — писать свой. */
  it("крестик очищает заголовок и возвращает фокус в поле", async () => {
    const user = userEvent.setup();
    setup();
    await user.type(
      screen.getByLabelText("Описание новой задачи в разделе «Разное»"),
      "КНОПКА не жмётся",
    );
    await user.click(screen.getByRole("button", { name: "Изменить" }));
    const title = screen.getByLabelText("Заголовок");
    expect(title).toHaveValue("Кнопка");

    await user.click(
      screen.getByRole("button", { name: "Очистить заголовок" }),
    );

    expect(title).toHaveValue("");
    expect(title).toHaveFocus();
    expect(
      screen.queryByRole("button", { name: "Очистить заголовок" }),
    ).not.toBeInTheDocument();
  });

  /* VED-376: кнопка выбора файлов — «Выбрать», без слова «файлы». */
  it("кнопка выбора файлов подписана «Выбрать», поле названо подписью", () => {
    setup();
    expect(screen.getByText("Выбрать")).toBeInTheDocument();
    expect(screen.getByLabelText("Скриншоты и файлы")).toHaveAttribute(
      "type",
      "file",
    );
  });
});
