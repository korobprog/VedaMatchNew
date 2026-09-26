import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkBoardDto, WorkTaskDto } from "@vedamatch/shared";
import { WorkTaskDialog } from "./task-dialog";
import { duePresetInput } from "./task-due";
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
  sectionId: "c1",
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
    { id: "c1", name: "РАЗНОЕ", statusMark: null, tasks: [] },
    { id: "c2", name: "Тестерование", statusMark: "testing", tasks: [] },
    { id: "c3", name: "МУЗЫКА", statusMark: null, tasks: [] },
  ],
  members: [{ userId: "u2", name: "Радха" }],
} as unknown as WorkBoardDto;

function open() {
  const props = { onClose: vi.fn(), onChanged: vi.fn() };
  render(<WorkTaskDialog taskId="t1" board={board} {...props} />);
  return props;
}

beforeEach(() => {
  // Черновики карточки живут в памяти вкладки (VED-520): тесты не должны
  // получать правки соседнего.
  sessionStorage.clear();
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

    // Поле заводится заново с сохранённым текстом — ищем его снова.
    expect(screen.getByLabelText("Название задачи")).toHaveValue(
      "Кнопка сохранить",
    );
    expect(updateWorkTask).not.toHaveBeenCalled();
  });

  it("saves the description typed right before Ctrl+Enter (VED-453)", async () => {
    const user = userEvent.setup();
    open();
    const description = await screen.findByPlaceholderText(
      "Что именно нужно сделать и что считать готовым",
    );

    await user.type(description, " и новое{Control>}{Enter}{/Control}");

    expect(updateWorkTask).toHaveBeenCalledWith("t1", {
      description: "Старое описание и новое",
    });
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

  it("смена статуса уходит сразу, без «Сохранить» (VED-526)", async () => {
    const user = userEvent.setup();
    const props = open();
    await screen.findByDisplayValue("Кнопка сохранить");

    await user.selectOptions(screen.getByLabelText("Статус"), "c2");

    expect(moveWorkTask).toHaveBeenCalledWith("t1", { columnId: "c2" });
    expect(updateWorkTask).not.toHaveBeenCalled();
    expect(await screen.findByRole("status")).toHaveTextContent("Сохранено");
    expect(screen.queryByRole("button", { name: "Сохранить" })).toBeNull();
    expect(props.onChanged).toHaveBeenCalled();
  });

  it("появляется после смены срока", async () => {
    const user = userEvent.setup();
    open();
    await screen.findByDisplayValue("Кнопка сохранить");

    // Пустой срок — выбор из вариантов (VED-529); выбранный становится
    // полем даты, которое можно уточнить.
    await user.selectOptions(screen.getByLabelText("Срок"), "tomorrow");
    const expected = duePresetInput("tomorrow", new Date());
    expect(screen.getByLabelText("Срок")).toHaveValue(expected);

    expect(screen.getByText("Есть несохранённые правки")).toBeInTheDocument();
    expect(updateWorkTask).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Сохранить" }));
    expect(updateWorkTask).toHaveBeenCalledWith("t1", {
      dueAt: new Date(expected).toISOString(),
    });
  });

  it("статус уходит сразу, а несохранённая правка поля ждёт «Сохранить» (VED-526)", async () => {
    const user = userEvent.setup();
    open();
    const title = await screen.findByLabelText("Название задачи");

    await user.type(title, "!");
    await user.selectOptions(screen.getByLabelText("Статус"), "c2");

    // Перенос ушёл один, без правки названия.
    expect(moveWorkTask).toHaveBeenCalledWith("t1", { columnId: "c2" });
    expect(updateWorkTask).not.toHaveBeenCalled();

    const save = await screen.findByRole("button", { name: "Сохранить" });
    await waitFor(() => expect(save).toBeEnabled());
    await user.click(save);
    expect(updateWorkTask).toHaveBeenCalledWith("t1", {
      title: "Кнопка сохранить!",
    });
    expect(moveWorkTask).toHaveBeenCalledTimes(1);
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
    await user.selectOptions(screen.getByLabelText("Статус"), "c2");
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

describe("WorkTaskDialog — раздел отдельно от статуса (VED-430)", () => {
  it("два поля: раздел — темы доски, статус — колонки статуса", async () => {
    open();
    await screen.findByDisplayValue("Кнопка сохранить");
    const section = screen.getByLabelText("Раздел");
    const status = screen.getByLabelText("Статус");
    expect(
      Array.from((section as HTMLSelectElement).options).map((o) => o.text),
    ).toEqual(["РАЗНОЕ", "МУЗЫКА"]);
    expect(
      Array.from((status as HTMLSelectElement).options).map((o) => o.text),
    ).toEqual(["Без статуса", "Тестерование"]);
    expect(section).toHaveValue("c1");
    expect(status).toHaveValue("");
  });

  it("новый раздел у задачи без статуса — переезд в него", async () => {
    const user = userEvent.setup();
    open();
    await screen.findByDisplayValue("Кнопка сохранить");

    await user.selectOptions(screen.getByLabelText("Раздел"), "c3");
    await user.click(screen.getByRole("button", { name: "Сохранить" }));

    expect(moveWorkTask).toHaveBeenCalledWith("t1", {
      columnId: "c3",
      sectionColumnId: "c3",
    });
  });

  it("новый раздел у задачи в статусе — статус остаётся, меняется поле", async () => {
    const user = userEvent.setup();
    vi.mocked(getWorkTask).mockResolvedValue({
      ...task,
      columnId: "c2",
      sectionId: "c1",
    } as WorkTaskDto);
    open();
    await screen.findByDisplayValue("Кнопка сохранить");
    expect(screen.getByLabelText("Статус")).toHaveValue("c2");

    await user.selectOptions(screen.getByLabelText("Раздел"), "c3");

    // Уходит сразу, без «Сохранить» (VED-526).
    expect(updateWorkTask).toHaveBeenCalledWith("t1", { sectionColumnId: "c3" });
    expect(moveWorkTask).not.toHaveBeenCalled();
  });

  it("«Без статуса» возвращает задачу в её раздел", async () => {
    const user = userEvent.setup();
    vi.mocked(getWorkTask).mockResolvedValue({
      ...task,
      columnId: "c2",
      sectionId: "c3",
    } as WorkTaskDto);
    open();
    await screen.findByDisplayValue("Кнопка сохранить");

    await user.selectOptions(screen.getByLabelText("Статус"), "");

    expect(moveWorkTask).toHaveBeenCalledWith("t1", { columnId: "c3" });
  });
});

describe("WorkTaskDialog — длинный пункт чек-листа (VED-375)", () => {
  it("свёрнут и раскрывается кнопкой «Далее»", async () => {
    const user = userEvent.setup();
    vi.mocked(getWorkTask).mockResolvedValue({
      ...task,
      checklist: [
        { id: "i1", text: "Очень длинный пункт. ".repeat(12), done: false, position: 0 },
        { id: "i2", text: "Короткий", done: false, position: 1 },
      ],
      checklistTotal: 2,
    } as unknown as WorkTaskDto);
    open();
    const more = await screen.findByRole("button", { name: "Далее" });
    expect(more).toHaveAttribute("aria-expanded", "false");
    // У короткого пункта кнопки нет.
    expect(screen.getAllByRole("button", { name: "Далее" })).toHaveLength(1);

    await user.click(more);
    expect(screen.getByRole("button", { name: "Свернуть" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
  });

  it("поле пункта принимает до 2000 знаков", async () => {
    open();
    expect(await screen.findByLabelText("Новый пункт чек-листа")).toHaveAttribute(
      "maxLength",
      "2000",
    );
  });
});

describe("WorkTaskDialog — индикатор вложений (VED-431)", () => {
  it("скрепка с числом у номера ведёт к вложениям", async () => {
    vi.mocked(getWorkTask).mockResolvedValue({
      ...task,
      attachments: [
        {
          id: "a1",
          name: "shot.png",
          mime: "image/png",
          sizeBytes: 1,
          width: null,
          height: null,
          url: "",
          createdAt: "2026-09-09T00:00:00.000Z",
        },
      ],
    } as unknown as WorkTaskDto);
    open();
    const link = await screen.findByRole("link", {
      name: "Вложения: 1. Перейти к ним",
    });
    expect(link).toHaveAttribute("href", "#work-task-attachments");
  });
});

describe("WorkTaskDialog — несохранённое переживает уход в другое окно (VED-520)", () => {
  it("правка и недописанный комментарий возвращаются при новом открытии", async () => {
    const user = userEvent.setup();
    const props = { onClose: vi.fn(), onChanged: vi.fn() };
    const first = render(
      <WorkTaskDialog taskId="t1" board={board} {...props} />,
    );
    await screen.findByDisplayValue("Кнопка сохранить");
    await user.selectOptions(screen.getByLabelText("Важность"), "high");
    await user.type(
      screen.getByLabelText("Новый комментарий"),
      "ещё пишу",
    );

    // Ушли в другое окно портала: окно карточки снято без закрытия.
    first.unmount();
    render(<WorkTaskDialog taskId="t1" board={board} {...props} />);
    await screen.findByDisplayValue("Кнопка сохранить");

    expect(screen.getByLabelText("Важность")).toHaveValue("high");
    expect(screen.getByText("Есть несохранённые правки")).toBeInTheDocument();
    expect(screen.getByLabelText("Новый комментарий")).toHaveValue("ещё пишу");
    expect(updateWorkTask).not.toHaveBeenCalled();
  });
});


describe("WorkTaskDialog — правка пункта чек-листа (VED-524)", () => {
  const withItem = () =>
    vi.mocked(getWorkTask).mockResolvedValue({
      ...task,
      checklist: [{ id: "i1", text: "Опечтака", done: false, position: 0 }],
      checklistTotal: 1,
    } as unknown as WorkTaskDto);

  it("«Изменить» рядом с «Убрать»: Enter сохраняет новый текст", async () => {
    const user = userEvent.setup();
    withItem();
    vi.mocked(updateWorkChecklistItem).mockResolvedValue(task);
    open();

    await user.click(
      await screen.findByRole("button", { name: "Изменить пункт «Опечтака»" }),
    );
    const field = screen.getByLabelText("Текст пункта чек-листа");
    await user.clear(field);
    await user.type(field, "Опечатка{Enter}");

    expect(updateWorkChecklistItem).toHaveBeenCalledWith("i1", {
      text: "Опечатка",
    });
  });

  it("Escape отменяет правку, а окно карточки остаётся открытым", async () => {
    const user = userEvent.setup();
    withItem();
    vi.mocked(updateWorkChecklistItem).mockClear();
    const props = open();

    await user.click(
      await screen.findByRole("button", { name: "Изменить пункт «Опечтака»" }),
    );
    await user.type(screen.getByLabelText("Текст пункта чек-листа"), "{Escape}");

    expect(screen.queryByLabelText("Текст пункта чек-листа")).toBeNull();
    expect(props.onClose).not.toHaveBeenCalled();
    expect(updateWorkChecklistItem).not.toHaveBeenCalled();
  });
});
