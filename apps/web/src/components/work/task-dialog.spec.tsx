import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkBoardDto, WorkTaskDto } from "@vedamatch/shared";
import { WorkTaskDialog } from "./task-dialog";
import {
  attachWorkFile,
  deleteWorkTaskForever,
  getWorkTask,
  moveWorkTask,
  updateWorkChecklistItem,
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
  columns: [
    { id: "c1", name: "Работа", tasks: [] },
    { id: "c2", name: "Тестерование", tasks: [] },
  ],
  members: [{ userId: "u2", name: "Радха" }],
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
  vi.mocked(moveWorkTask).mockReset();
  vi.mocked(moveWorkTask).mockImplementation((_id, body) =>
    Promise.resolve({ ...task, columnId: body.columnId } as WorkTaskDto),
  );
  vi.mocked(deleteWorkTaskForever).mockReset();
  vi.mocked(deleteWorkTaskForever).mockResolvedValue(undefined);
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

/**
 * VED-56, второй круг: «Сделай, чтобы кнопка сохранить появлялась после любой
 * правки. Сейчас не так». Раньше раздел, исполнитель, важность и срок уходили
 * на сервер в момент выбора, и кнопки после них не было.
 */
describe("WorkTaskDialog — кнопка «Сохранить» после любой правки (VED-56)", () => {
  it("появляется после смены важности и ничего не отправляет до нажатия", async () => {
    const user = userEvent.setup();
    open();
    await screen.findByDisplayValue("Кнопка сохранить");

    await user.selectOptions(screen.getByLabelText("Важность"), "high");

    expect(screen.getByText("Есть несохранённые правки")).toBeInTheDocument();
    expect(updateWorkTask).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Сохранить" }));
    expect(updateWorkTask).toHaveBeenCalledWith("t1", { priority: "high" });
    expect(await screen.findByRole("status")).toHaveTextContent("Сохранено");
  });

  it("появляется после смены исполнителя", async () => {
    const user = userEvent.setup();
    open();
    await screen.findByDisplayValue("Кнопка сохранить");

    await user.selectOptions(screen.getByLabelText("Исполнитель"), "u2");

    expect(screen.getByRole("button", { name: "Сохранить" })).toBeEnabled();
    expect(updateWorkTask).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Сохранить" }));
    expect(updateWorkTask).toHaveBeenCalledWith("t1", { assigneeId: "u2" });
  });

  it("появляется после смены раздела; перенос уходит своим запросом", async () => {
    const user = userEvent.setup();
    const props = open();
    await screen.findByDisplayValue("Кнопка сохранить");

    await user.selectOptions(screen.getByLabelText("Раздел"), "c2");

    expect(moveWorkTask).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Сохранить" }));
    expect(moveWorkTask).toHaveBeenCalledWith("t1", { columnId: "c2" });
    expect(updateWorkTask).not.toHaveBeenCalled();
    expect(await screen.findByRole("status")).toHaveTextContent("Сохранено");
    expect(props.onChanged).toHaveBeenCalled();
  });

  it("появляется после смены срока", async () => {
    const user = userEvent.setup();
    open();
    await screen.findByDisplayValue("Кнопка сохранить");

    const due = screen.getByLabelText("Срок");
    await user.type(due, "2026-09-30T18:00");

    expect(screen.getByText("Есть несохранённые правки")).toBeInTheDocument();
    expect(updateWorkTask).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Сохранить" }));
    expect(updateWorkTask).toHaveBeenCalledWith("t1", {
      dueAt: new Date("2026-09-30T18:00").toISOString(),
    });
  });

  it("правка поля и раздела вместе — оба запроса одной кнопкой", async () => {
    const user = userEvent.setup();
    open();
    const title = await screen.findByLabelText("Название задачи");

    await user.type(title, "!");
    await user.selectOptions(screen.getByLabelText("Раздел"), "c2");
    await user.click(screen.getByRole("button", { name: "Сохранить" }));

    expect(updateWorkTask).toHaveBeenCalledWith("t1", {
      title: "Кнопка сохранить!",
    });
    expect(moveWorkTask).toHaveBeenCalledWith("t1", { columnId: "c2" });
  });

  it("«Отменить правки» возвращает и списки", async () => {
    const user = userEvent.setup();
    open();
    await screen.findByDisplayValue("Кнопка сохранить");

    await user.selectOptions(screen.getByLabelText("Важность"), "high");
    await user.click(screen.getByRole("button", { name: "Отменить правки" }));

    expect(screen.getByLabelText("Важность")).toHaveValue("normal");
    expect(screen.queryByRole("button", { name: "Сохранить" })).toBeNull();
  });

  it("закрытие окна не теряет выбранного в списке", async () => {
    const user = userEvent.setup();
    const props = open();
    await screen.findByDisplayValue("Кнопка сохранить");

    await user.selectOptions(screen.getByLabelText("Исполнитель"), "u2");
    await user.selectOptions(screen.getByLabelText("Раздел"), "c2");
    await user.keyboard("{Escape}");

    expect(props.onClose).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(moveWorkTask).toHaveBeenCalledWith("t1", { columnId: "c2" }),
    );
    expect(updateWorkTask).toHaveBeenCalledWith("t1", { assigneeId: "u2" });
  });

  it("галочка чек-листа уходит сразу, и окно говорит «Сохранено»", async () => {
    // У пункта чек-листа нет черновика: нажатие на галочку — уже решение.
    // Но и здесь человек должен видеть, что дошло.
    const withItem = {
      ...task,
      checklist: [{ id: "i1", text: "Проверить", done: false, position: 0 }],
      checklistTotal: 1,
    } as unknown as WorkTaskDto;
    vi.mocked(getWorkTask).mockResolvedValue(withItem);
    vi.mocked(updateWorkChecklistItem).mockResolvedValue({
      ...withItem,
      checklist: [{ id: "i1", text: "Проверить", done: true, position: 0 }],
    } as unknown as WorkTaskDto);
    const user = userEvent.setup();
    open();

    await user.click(await screen.findByLabelText("Проверить"));

    expect(updateWorkChecklistItem).toHaveBeenCalledWith("i1", { done: true });
    expect(await screen.findByRole("status")).toHaveTextContent("Сохранено");
  });
});

describe("WorkTaskDialog — несколько вложений за раз (VED-112)", () => {
  const shot = (name: string) =>
    new File(["x"], name, { type: "image/png" });

  it("прикрепляет все выбранные скриншоты по одному", async () => {
    vi.mocked(attachWorkFile).mockReset();
    vi.mocked(attachWorkFile).mockImplementation((_id, file) =>
      Promise.resolve({
        ...task,
        attachments: [
          {
            id: file.name,
            name: file.name,
            mime: "image/png",
            sizeBytes: 1,
            url: `https://files.test/${file.name}`,
            createdAt: "2026-09-13T00:00:00.000Z",
          },
        ],
      } as unknown as WorkTaskDto),
    );
    const user = userEvent.setup();
    const props = open();
    const input = await screen.findByLabelText(
      "Прикрепить картинки или файлы",
    );

    expect(input).toHaveAttribute("multiple");
    await user.upload(input, [shot("1.png"), shot("2.png"), shot("3.png")]);

    await waitFor(() => expect(attachWorkFile).toHaveBeenCalledTimes(3));
    expect(vi.mocked(attachWorkFile).mock.calls.map(([id, f]) => [id, f.name]))
      .toEqual([
        ["t1", "1.png"],
        ["t1", "2.png"],
        ["t1", "3.png"],
      ]);
    await waitFor(() => expect(props.onChanged).toHaveBeenCalled());
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("называет скриншот, который не приложился, а остальные оставляет", async () => {
    vi.mocked(attachWorkFile).mockReset();
    vi.mocked(attachWorkFile).mockImplementation((_id, file) =>
      file.name === "big.png"
        ? Promise.reject(new Error("Файл больше 10 МБ"))
        : Promise.resolve(task),
    );
    const user = userEvent.setup();
    const props = open();
    const input = await screen.findByLabelText(
      "Прикрепить картинки или файлы",
    );

    await user.upload(input, [shot("a.png"), shot("big.png"), shot("c.png")]);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "«big.png» не приложился: Файл больше 10 МБ",
    );
    expect(attachWorkFile).toHaveBeenCalledTimes(3);
    expect(props.onChanged).toHaveBeenCalled();
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
