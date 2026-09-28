import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkBoardDto, WorkTaskDto } from "@vedamatch/shared";
import { WorkTaskDialog } from "./task-dialog";
import { dueToInput } from "./task-due";
import { workUploads } from "./work-uploads";
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
    expect(props.onChanged).toHaveBeenCalled();
    // VED-400: сохранили — окно закрывается.
    await waitFor(() => expect(props.onClose).toHaveBeenCalledTimes(1));
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

  it("✖ стирает заголовок, оставляет описание и ставит курсор в поле (VED-488)", async () => {
    const user = userEvent.setup();
    open();
    await screen.findByDisplayValue("Кнопка сохранить");
    const description = screen.getByPlaceholderText(
      /Что именно нужно сделать/,
    );
    await user.type(description, " и новое");

    await user.click(
      screen.getByRole("button", { name: "Очистить заголовок" }),
    );

    const title = screen.getByLabelText("Название задачи");
    expect(title).toHaveValue("");
    await waitFor(() => expect(title).toHaveFocus());
    expect(description).toHaveValue("Старое описание и новое");
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "Очистить заголовок" }),
      ).toBeNull(),
    );

    await user.type(title, "Свой заголовок{Enter}");
    expect(updateWorkTask).toHaveBeenCalledWith("t1", {
      title: "Свой заголовок",
      description: "Старое описание и новое",
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

  it("смена статуса уходит сразу, и «Сохранить» не появляется (VED-526, VED-611)", async () => {
    const user = userEvent.setup();
    const props = open();
    await screen.findByDisplayValue("Кнопка сохранить");

    await user.selectOptions(screen.getByLabelText("Статус"), "c2");

    expect(moveWorkTask).toHaveBeenCalledWith(
      "t1",
      { columnId: "c2" },
      { keepalive: true },
    );
    expect(updateWorkTask).not.toHaveBeenCalled();
    await waitFor(() => expect(props.onChanged).toHaveBeenCalled());
    expect(screen.getByLabelText("Статус")).toHaveValue("c2");
    // Ни пока летит, ни после: ни «Сохранить», ни полосы «Сохранено».
    expect(screen.queryByRole("button", { name: "Сохранить" })).toBeNull();
    expect(screen.queryByText("Есть несохранённые правки")).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
    expect(props.onClose).not.toHaveBeenCalled();
  });

  it("пока статус летит, «Сохранить» не показывается (VED-611)", async () => {
    const user = userEvent.setup();
    let finish: (value: WorkTaskDto) => void = () => {};
    vi.mocked(moveWorkTask).mockImplementation(
      () => new Promise((resolve) => (finish = resolve)),
    );
    open();
    await screen.findByDisplayValue("Кнопка сохранить");

    await user.selectOptions(screen.getByLabelText("Статус"), "c2");

    expect(screen.getByLabelText("Статус")).toHaveValue("c2");
    expect(screen.queryByRole("button", { name: "Сохранить" })).toBeNull();
    finish({ ...task, columnId: "c2" } as WorkTaskDto);
    await waitFor(() =>
      expect(screen.getByLabelText("Статус")).toHaveValue("c2"),
    );
  });

  it("сервер не принял статус — выбор откатывается, окно говорит почему (VED-611)", async () => {
    const user = userEvent.setup();
    vi.mocked(moveWorkTask).mockRejectedValue(new Error("Нет прав"));
    open();
    await screen.findByDisplayValue("Кнопка сохранить");

    await user.selectOptions(screen.getByLabelText("Статус"), "c2");

    expect(await screen.findByRole("alert")).toHaveTextContent("Нет прав");
    expect(screen.getByLabelText("Статус")).toHaveValue("");
    expect(screen.queryByRole("button", { name: "Сохранить" })).toBeNull();
  });

  it("окно закрыли сразу после выбора — перенос всё равно доходит (VED-611)", async () => {
    const user = userEvent.setup();
    let finish: (value: WorkTaskDto) => void = () => {};
    vi.mocked(moveWorkTask).mockImplementation(
      () => new Promise((resolve) => (finish = resolve)),
    );
    const props = { onClose: vi.fn(), onChanged: vi.fn() };
    const view = render(
      <WorkTaskDialog taskId="t1" board={board} {...props} />,
    );
    await screen.findByDisplayValue("Кнопка сохранить");

    await user.selectOptions(screen.getByLabelText("Статус"), "c2");
    await user.keyboard("{Escape}");
    view.unmount();

    // Закрытие не отправило перенос второй раз и не отменило первый.
    expect(moveWorkTask).toHaveBeenCalledTimes(1);
    finish({ ...task, columnId: "c2" } as WorkTaskDto);
    await waitFor(() => expect(props.onChanged).toHaveBeenCalled());
    expect(updateWorkTask).not.toHaveBeenCalled();
  });

  it("появляется после смены срока", async () => {
    const user = userEvent.setup();
    const dueAt = "2026-09-10T20:59:00.000Z";
    vi.mocked(getWorkTask).mockResolvedValue({ ...task, dueAt });
    open();
    await screen.findByDisplayValue("Кнопка сохранить");

    // Поставленный срок по-прежнему правится (VED-598).
    const due = screen.getByLabelText("Срок");
    expect(due).toHaveValue(dueToInput(dueAt));
    const expected = "2026-09-12T23:59";
    fireEvent.change(due, { target: { value: expected } });

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
    expect(moveWorkTask).toHaveBeenCalledWith(
      "t1",
      { columnId: "c2" },
      { keepalive: true },
    );
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
      expect(moveWorkTask).toHaveBeenCalledWith(
        "t1",
        { columnId: "c2" },
        { keepalive: true },
      ),
    );
    expect(moveWorkTask).toHaveBeenCalledTimes(1);
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

describe("WorkTaskDialog — загрузка переживает закрытие окна (VED-608)", () => {
  const shot = (name: string) => new File(["x"], name, { type: "image/png" });

  it("окно закрыли посреди загрузки — файлы уходят дальше, итог остаётся в очереди портала", async () => {
    let finish: (value: WorkTaskDto) => void = () => {};
    vi.mocked(attachWorkFile).mockReset();
    vi.mocked(attachWorkFile).mockImplementation(
      () =>
        new Promise<WorkTaskDto>((resolve) => {
          finish = resolve;
        }),
    );
    const user = userEvent.setup();
    const props = { onClose: vi.fn(), onChanged: vi.fn() };
    const view = render(
      <WorkTaskDialog taskId="t1" board={board} {...props} />,
    );
    const input = await screen.findByLabelText("Прикрепить картинки или файлы");
    await user.upload(input, shot("1.png"));
    expect(workUploads.isBusy()).toBe(true);

    // Ушли в другое окно портала: доска и окно задачи размонтированы.
    view.unmount();
    finish(task);

    await waitFor(() =>
      expect(workUploads.getSnapshot()).toContainEqual(
        expect.objectContaining({
          taskKey: "VED-56",
          phase: "done",
          problem: null,
        }),
      ),
    );
    expect(props.onChanged).not.toHaveBeenCalled();
    for (const job of workUploads.getSnapshot()) workUploads.dismiss(job.id);
  });

  it("окно открыли заново — прогресс виден и в нём, и итог забирает оно", async () => {
    let finish: (value: WorkTaskDto) => void = () => {};
    vi.mocked(attachWorkFile).mockReset();
    vi.mocked(attachWorkFile).mockImplementation(
      () =>
        new Promise<WorkTaskDto>((resolve) => {
          finish = resolve;
        }),
    );
    const user = userEvent.setup();
    const first = render(
      <WorkTaskDialog
        taskId="t1"
        board={board}
        onClose={vi.fn()}
        onChanged={vi.fn()}
      />,
    );
    await user.upload(
      await screen.findByLabelText("Прикрепить картинки или файлы"),
      shot("1.png"),
    );
    first.unmount();

    const props = open();
    expect(await screen.findByLabelText("Загружаю…")).toBeDisabled();
    finish(task);

    await waitFor(() => expect(props.onChanged).toHaveBeenCalled());
    expect(workUploads.getSnapshot()).toEqual([]);
  });
});

describe("WorkTaskDialog — «Прикрепить» с первого нажатия (VED-266)", () => {
  const shot = (name: string) => new File(["x"], name, { type: "image/png" });

  it("нажатие на видимую кнопку открывает выбор файла", async () => {
    const user = userEvent.setup();
    open();
    const input = await screen.findByLabelText("Прикрепить картинки или файлы");
    const picked = vi.fn();
    input.addEventListener("click", picked);

    await user.click(screen.getByText("Прикрепить картинки или файлы"));

    expect(picked).toHaveBeenCalledTimes(1);
  });

  it("пока файл грузится, кнопка пишет «Загружаю…» и не принимает второй выбор", async () => {
    let finish: (value: WorkTaskDto) => void = () => {};
    vi.mocked(attachWorkFile).mockReset();
    vi.mocked(attachWorkFile).mockImplementation(
      () =>
        new Promise<WorkTaskDto>((resolve) => {
          finish = resolve;
        }),
    );
    const user = userEvent.setup();
    open();
    const input = await screen.findByLabelText("Прикрепить картинки или файлы");

    await user.upload(input, shot("1.png"));

    const pending = screen.getByLabelText("Загружаю…");
    expect(pending).toBe(input);
    expect(input).toBeDisabled();

    finish(task);
    expect(
      await screen.findByLabelText("Прикрепить картинки или файлы"),
    ).toBeEnabled();
  });

  it("корзина у вложения — кнопка с областью 40×40", async () => {
    vi.mocked(getWorkTask).mockResolvedValueOnce({
      ...task,
      attachments: [
        {
          id: "f1",
          name: "shot.png",
          mime: "image/png",
          sizeBytes: 1,
          url: "https://files.test/shot.png",
          createdAt: "2026-09-13T00:00:00.000Z",
        },
        {
          id: "f2",
          name: "смета.pdf",
          mime: "application/pdf",
          sizeBytes: 1,
          url: "https://files.test/smeta.pdf",
          createdAt: "2026-09-13T00:00:00.000Z",
        },
      ],
    } as unknown as WorkTaskDto);
    open();

    for (const name of ["shot.png", "смета.pdf"]) {
      const trash = await screen.findByRole("button", {
        name: `Убрать вложение «${name}»`,
      });
      expect(trash.className).toContain("size-10");
      expect(trash.className).toContain("active:");
    }
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
    ).toEqual(["Новое", "Тестерование"]);
    expect(section).toHaveValue("c1");
    expect(status).toHaveValue("");
  });

  it("новый раздел у задачи без статуса — переезд в него", async () => {
    const user = userEvent.setup();
    open();
    await screen.findByDisplayValue("Кнопка сохранить");

    await user.selectOptions(screen.getByLabelText("Раздел"), "c3");

    // Уходит сразу, без «Сохранить» (VED-611).
    expect(moveWorkTask).toHaveBeenCalledWith(
      "t1",
      { columnId: "c3", sectionColumnId: "c3" },
      { keepalive: true },
    );
    expect(screen.queryByRole("button", { name: "Сохранить" })).toBeNull();
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
    expect(updateWorkTask).toHaveBeenCalledWith(
      "t1",
      { sectionColumnId: "c3" },
      { keepalive: true },
    );
    expect(moveWorkTask).not.toHaveBeenCalled();
  });

  it("«Новое» (без статуса) возвращает задачу в её раздел", async () => {
    const user = userEvent.setup();
    vi.mocked(getWorkTask).mockResolvedValue({
      ...task,
      columnId: "c2",
      sectionId: "c3",
    } as WorkTaskDto);
    open();
    await screen.findByDisplayValue("Кнопка сохранить");

    await user.selectOptions(screen.getByLabelText("Статус"), "");

    expect(moveWorkTask).toHaveBeenCalledWith(
      "t1",
      { columnId: "c3" },
      { keepalive: true },
    );
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

  it("скрепка и крестик — в панели над заголовком, а не сбоку от него (VED-602)", async () => {
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
    const close = screen.getByRole("button", { name: "Закрыть" });
    const title = screen.getByLabelText("Название задачи");
    // Одна строка-панель на номер, скрепку и крестик…
    expect(close.closest("div")).toBe(link.parentElement);
    // …и заголовок под ней, отдельным блоком во всю ширину.
    expect(title.closest("div")?.contains(link)).toBe(false);
    expect(
      link.compareDocumentPosition(title) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
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


describe("WorkTaskDialog — правка пункта чек-листа нажатием на текст (VED-524, VED-603)", () => {
  const withItem = () =>
    vi.mocked(getWorkTask).mockResolvedValue({
      ...task,
      checklist: [{ id: "i1", text: "Опечтака", done: false, position: 0 }],
      checklistTotal: 1,
    } as unknown as WorkTaskDto);

  beforeEach(() => {
    vi.mocked(updateWorkChecklistItem).mockReset();
  });

  it("кнопки-карандаша нет: правку открывает сам текст пункта", async () => {
    withItem();
    open();
    const text = await screen.findByRole("button", {
      name: "Изменить пункт: Опечтака",
    });
    expect(text).toHaveTextContent("Опечтака");
    expect(
      screen.queryByRole("button", { name: /^Изменить пункт «/ }),
    ).toBeNull();
    // Галочка по-прежнему названа текстом пункта и отмечает, а не правит.
    expect(screen.getByRole("checkbox", { name: "Опечтака" })).toBeInTheDocument();
  });

  it("нажатие на текст — поле на месте, Enter сохраняет новый текст", async () => {
    const user = userEvent.setup();
    withItem();
    vi.mocked(updateWorkChecklistItem).mockResolvedValue(task);
    open();

    await user.click(
      await screen.findByRole("button", { name: "Изменить пункт: Опечтака" }),
    );
    const field = screen.getByLabelText("Текст пункта чек-листа");
    expect(field).toHaveFocus();
    await user.clear(field);
    await user.type(field, "Опечатка{Enter}");

    expect(updateWorkChecklistItem).toHaveBeenCalledTimes(1);
    expect(updateWorkChecklistItem).toHaveBeenCalledWith("i1", {
      text: "Опечатка",
    });
  });

  it("уход из поля тоже сохраняет", async () => {
    const user = userEvent.setup();
    withItem();
    vi.mocked(updateWorkChecklistItem).mockResolvedValue(task);
    open();

    await user.click(
      await screen.findByRole("button", { name: "Изменить пункт: Опечтака" }),
    );
    const field = screen.getByLabelText("Текст пункта чек-листа");
    await user.clear(field);
    await user.type(field, "Опечатка");
    await user.click(screen.getByLabelText("Новый пункт чек-листа"));

    expect(updateWorkChecklistItem).toHaveBeenCalledTimes(1);
    expect(updateWorkChecklistItem).toHaveBeenCalledWith("i1", {
      text: "Опечатка",
    });
  });

  it("с клавиатуры: Enter на тексте открывает правку", async () => {
    const user = userEvent.setup();
    withItem();
    open();

    (
      await screen.findByRole("button", { name: "Изменить пункт: Опечтака" })
    ).focus();
    await user.keyboard("{Enter}");

    expect(screen.getByLabelText("Текст пункта чек-листа")).toHaveFocus();
  });

  it("Escape отменяет правку, возвращает фокус на текст, окно остаётся", async () => {
    const user = userEvent.setup();
    withItem();
    const props = open();

    await user.click(
      await screen.findByRole("button", { name: "Изменить пункт: Опечтака" }),
    );
    await user.type(screen.getByLabelText("Текст пункта чек-листа"), "{Escape}");

    expect(screen.queryByLabelText("Текст пункта чек-листа")).toBeNull();
    expect(
      screen.getByRole("button", { name: "Изменить пункт: Опечтака" }),
    ).toHaveFocus();
    expect(props.onClose).not.toHaveBeenCalled();
    expect(updateWorkChecklistItem).not.toHaveBeenCalled();
  });
});

/**
 * VED-578: «Сделай кнопку — Далее для описания задач, чтобы можно было
 * прочитать полностью». Длинное описание пряталось под прокрутку внутри
 * поля в четыре строки.
 */
describe("WorkTaskDialog — «Читать далее» у описания (VED-578)", () => {
  function fakeHeights(scroll: number, client: number) {
    const proto = HTMLTextAreaElement.prototype;
    const spies = [
      vi.spyOn(proto, "scrollHeight", "get").mockReturnValue(scroll),
      vi.spyOn(proto, "clientHeight", "get").mockReturnValue(client),
    ];
    return () => spies.forEach((spy) => spy.mockRestore());
  }

  it("shows no button while the description fits", async () => {
    const restore = fakeHeights(80, 80);
    try {
      open();
      await screen.findByPlaceholderText(/Что именно нужно сделать/);
      expect(screen.queryByRole("button", { name: "Читать далее" })).toBeNull();
    } finally {
      restore();
    }
  });

  it("expands a long description to its full height and collapses it back", async () => {
    const restore = fakeHeights(400, 80);
    try {
      const user = userEvent.setup();
      open();
      const description = await screen.findByPlaceholderText(
        /Что именно нужно сделать/,
      );
      const more = await screen.findByRole("button", { name: "Читать далее" });
      expect(more).toHaveAttribute("aria-expanded", "false");
      expect(more).toHaveAttribute("aria-controls", description.id);

      await user.click(more);

      expect(description.style.height).toBe("400px");
      const less = screen.getByRole("button", { name: "Свернуть" });
      expect(less).toHaveAttribute("aria-expanded", "true");

      await user.click(less);

      expect(description.style.height).toBe("");
      expect(
        screen.getByRole("button", { name: "Читать далее" }),
      ).toBeInTheDocument();
    } finally {
      restore();
    }
  });
});

describe("WorkTaskDialog — графа «Дата» (VED-598)", () => {
  it("на месте «Срока» показывает дату создания с годом", async () => {
    vi.mocked(getWorkTask).mockResolvedValue({
      ...task,
      createdAt: "2026-09-09T12:00:00.000Z",
    });
    open();
    await screen.findByDisplayValue("Кнопка сохранить");

    expect(screen.getByText("Дата")).toBeInTheDocument();
    expect(screen.getByText("9 сентября 2026 г.")).toBeInTheDocument();
    // У задачи без срока графы «Срок» нет вовсе.
    expect(screen.queryByLabelText("Срок")).toBeNull();
  });
});
