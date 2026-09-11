import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkBoardDto, WorkTaskDto } from "@vedamatch/shared";
import { WorkTaskDialog } from "./task-dialog";
import {
  hasTaskEdits,
  pendingTaskEdits,
  taskEditsProblem,
} from "./task-edits";
import {
  deleteWorkTaskForever,
  getWorkTask,
  updateWorkTask,
} from "@/lib/work-api";

vi.mock("@/lib/work-api", () => ({
  addWorkChecklistItem: vi.fn(),
  archiveWorkTask: vi.fn(),
  attachWorkFile: vi.fn(),
  removeWorkAttachment: vi.fn(),
  commentWorkTask: vi.fn(),
  deleteWorkTaskForever: vi.fn(),
  getWorkTask: vi.fn(),
  moveWorkTask: vi.fn(),
  removeWorkChecklistItem: vi.fn(),
  restoreWorkTask: vi.fn(),
  updateWorkChecklistItem: vi.fn(),
  updateWorkTask: vi.fn(),
}));

const task = {
  id: "t1",
  key: "VED-56",
  number: 56,
  columnId: "c1",
  title: "Кнопка сохранить",
  position: 0,
  priority: "normal",
  dueAt: null,
  completedAt: null,
  assignee: null,
  labels: [],
  checklistDone: 0,
  checklistTotal: 0,
  commentCount: 0,
  attachmentCount: 0,
  hasDescription: false,
  boardId: "b1",
  spaceId: "s1",
  description: "Старое описание",
  createdBy: null,
  checklist: [],
  comments: [],
  attachments: [],
  activity: [],
  createdAt: "2026-09-09T00:00:00.000Z",
  updatedAt: "2026-09-09T00:00:00.000Z",
  archivedAt: null,
} as unknown as WorkTaskDto;

const board = {
  id: "b1",
  role: "owner",
  columns: [{ id: "c1", name: "Работа", tasks: [] }],
  members: [],
} as unknown as WorkBoardDto;

function open() {
  const props = { onClose: vi.fn(), onChanged: vi.fn() };
  render(<WorkTaskDialog taskId="t1" board={board} {...props} />);
  return props;
}

beforeEach(() => {
  vi.mocked(getWorkTask).mockResolvedValue(task);
  vi.mocked(updateWorkTask).mockReset();
  vi.mocked(updateWorkTask).mockImplementation((_id, body) =>
    Promise.resolve({ ...task, ...body } as WorkTaskDto),
  );
  vi.mocked(deleteWorkTaskForever).mockReset();
  vi.mocked(deleteWorkTaskForever).mockResolvedValue(undefined);
});

describe("task edits", () => {
  const saved = { title: "Кнопка", description: "Текст" };

  it("counts only real changes as edits", () => {
    expect(
      hasTaskEdits(saved, { title: " Кнопка ", description: "Текст" }),
    ).toBe(false);
    expect(
      hasTaskEdits(saved, { title: "Кнопка", description: "Текст." }),
    ).toBe(true);
  });

  it("sends only what changed", () => {
    expect(
      pendingTaskEdits(saved, {
        title: "Кнопка «Сохранить»",
        description: "Текст",
      }),
    ).toEqual({ title: "Кнопка «Сохранить»" });
    expect(pendingTaskEdits(saved, saved)).toBeNull();
  });

  // Пустое название не сохраняется, но описание из-за него не теряется.
  it("drops an empty title but keeps the description", () => {
    expect(taskEditsProblem({ title: "  ", description: "" })).toBe(
      "Название не может быть пустым",
    );
    expect(
      pendingTaskEdits(saved, { title: "", description: "Новое" }),
    ).toEqual({ description: "Новое" });
  });
});

describe("WorkTaskDialog — кнопка «Сохранить» (VED-56)", () => {
  it("shows no save bar until something is edited", async () => {
    open();
    await screen.findByDisplayValue("Кнопка сохранить");
    expect(screen.queryByRole("button", { name: "Сохранить" })).toBeNull();
  });

  it("saves the title and description in one go and says so", async () => {
    const user = userEvent.setup();
    const props = open();
    const title = await screen.findByLabelText("Название задачи");

    await user.clear(title);
    await user.type(title, "Кнопка «Сохранить»");
    const description = screen.getByPlaceholderText(
      /Что именно нужно сделать/,
    );
    await user.clear(description);
    await user.type(description, "Видна после правки");
    expect(screen.getByText("Есть несохранённые правки")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Сохранить" }));

    expect(updateWorkTask).toHaveBeenCalledTimes(1);
    expect(updateWorkTask).toHaveBeenCalledWith("t1", {
      title: "Кнопка «Сохранить»",
      description: "Видна после правки",
    });
    expect(await screen.findByRole("status")).toHaveTextContent("Сохранено");
    expect(props.onChanged).toHaveBeenCalled();
  });

  it("saves with Enter in the title", async () => {
    const user = userEvent.setup();
    open();
    const title = await screen.findByLabelText("Название задачи");

    await user.type(title, "!{Enter}");

    expect(updateWorkTask).toHaveBeenCalledWith("t1", {
      title: "Кнопка сохранить!",
    });
  });

  it("puts the saved text back on «Отменить правки»", async () => {
    const user = userEvent.setup();
    open();
    const title = await screen.findByLabelText("Название задачи");

    await user.type(title, " лишнее");
    await user.click(screen.getByRole("button", { name: "Отменить правки" }));

    expect(title).toHaveValue("Кнопка сохранить");
    expect(updateWorkTask).not.toHaveBeenCalled();
  });

  it("refuses to save an empty title", async () => {
    const user = userEvent.setup();
    open();
    await user.clear(await screen.findByLabelText("Название задачи"));

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Название не может быть пустым",
    );
    expect(screen.getByRole("button", { name: "Сохранить" })).toBeDisabled();
  });

  // Раньше Escape прямо из поля закрывал окно раньше, чем правка сохранялась.
  it("keeps unsaved edits when the window is closed with Escape", async () => {
    const user = userEvent.setup();
    const props = open();
    const description = await screen.findByPlaceholderText(
      /Что именно нужно сделать/,
    );

    await user.type(description, " и ещё строка");
    await user.keyboard("{Escape}");

    expect(updateWorkTask).toHaveBeenCalledWith("t1", {
      description: "Старое описание и ещё строка",
    });
    expect(props.onClose).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(props.onChanged).toHaveBeenCalled());
  });
});

describe("WorkTaskDialog — «Удалить насовсем» (VED-6)", () => {
  it("стирает карточку после подтверждения и закрывает окно", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    const user = userEvent.setup();
    const props = open();

    await user.click(
      await screen.findByRole("button", { name: "Удалить насовсем" }),
    );

    expect(deleteWorkTaskForever).toHaveBeenCalledWith("t1");
    expect(props.onClose).toHaveBeenCalledTimes(1);
    confirm.mockRestore();
  });

  // Промах пальцем по соседней кнопке не должен стоить всего обсуждения.
  it("ничего не стирает, если передумали", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const user = userEvent.setup();
    const props = open();

    await user.click(
      await screen.findByRole("button", { name: "Удалить насовсем" }),
    );

    expect(deleteWorkTaskForever).not.toHaveBeenCalled();
    expect(props.onClose).not.toHaveBeenCalled();
    confirm.mockRestore();
  });

  it("участнику удаления не предлагает — только архив", async () => {
    render(
      <WorkTaskDialog
        taskId="t1"
        board={{ ...board, role: "member" } as WorkBoardDto}
        onClose={vi.fn()}
        onChanged={vi.fn()}
      />,
    );

    expect(
      await screen.findByRole("button", { name: "Убрать карточку в архив" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Удалить насовсем" }),
    ).toBeNull();
  });
});
