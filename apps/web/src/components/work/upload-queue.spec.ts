import { describe, expect, it, vi } from "vitest";
import {
  NETWORK_RETRIES,
  createWorkUploadQueue,
  describeUploadJob,
  filesWord,
  isNetworkFailure,
  taskHref,
  type WorkUploadJob,
} from "./upload-queue";

interface Task {
  id: string;
  key: string;
  files: string[];
}

const shot = (name: string) => new File(["x"], name, { type: "image/png" });

/** Промис, который разрешают руками: загрузка «висит», пока тест не отпустит. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (cause: unknown) => void;
  const promise = new Promise<T>((ok, fail) => {
    resolve = ok;
    reject = fail;
  });
  return { promise, resolve, reject };
}

function setup(
  overrides: Partial<
    Parameters<typeof createWorkUploadQueue<Task, { title: string }>>[0]
  > = {},
) {
  const attached: string[] = [];
  const queue = createWorkUploadQueue<Task, { title: string }>({
    createTask: async () => ({ id: "t1", key: "VED-1", files: [] }),
    attach: async (_taskId, file) => {
      attached.push(file.name);
      return { id: "t1", key: "VED-1", files: [...attached] };
    },
    ...overrides,
  });
  return { queue, attached };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("createWorkUploadQueue — задача с файлами (VED-608)", () => {
  it("разрешается, как только задача заведена, а файлы догружаются следом", async () => {
    const gate = deferred<Task>();
    const { queue } = setup({ attach: () => gate.promise });
    const onCreated = vi.fn();

    const task = await queue.createWithFiles({
      boardId: "b1",
      body: { title: "Кнопка" },
      title: "Кнопка",
      files: [shot("1.png"), shot("2.png")],
      boardHref: "/work/planner/s1",
      onCreated,
    });

    expect(task.key).toBe("VED-1");
    expect(onCreated).toHaveBeenCalledWith(task);
    const [job] = queue.getSnapshot();
    expect(job).toMatchObject({
      phase: "uploading",
      taskKey: "VED-1",
      total: 2,
      done: 0,
      href: "/work/planner/s1?task=VED-1",
    });
    expect(queue.isBusy()).toBe(true);
    gate.resolve({ id: "t1", key: "VED-1", files: [] });
  });

  it("без наблюдателя итог остаётся в списке — индикатор о нём сообщит", async () => {
    const { queue, attached } = setup();
    const onFilesDone = vi.fn();
    await queue.createWithFiles({
      boardId: "b1",
      body: { title: "Кнопка" },
      title: "Кнопка",
      files: [shot("1.png"), shot("2.png")],
      onFilesDone,
    });
    await flush();

    expect(attached).toEqual(["1.png", "2.png"]);
    expect(onFilesDone).toHaveBeenCalledWith(
      expect.objectContaining({ key: "VED-1" }),
      {
        last: { id: "t1", key: "VED-1", files: ["1.png", "2.png"] },
        problem: null,
      },
    );
    expect(queue.getSnapshot()).toEqual([
      expect.objectContaining({ phase: "done", done: 2, problem: null }),
    ]);
    expect(queue.isBusy()).toBe(false);
  });

  it("доска ещё открыта — задание уходит из списка тихо, итог показывает она", async () => {
    const { queue } = setup();
    await queue.createWithFiles({
      boardId: "b1",
      body: { title: "Кнопка" },
      title: "Кнопка",
      files: [shot("1.png")],
      watcher: { watching: () => true },
    });
    await flush();

    expect(queue.getSnapshot()).toEqual([]);
  });

  it("называет файл, который не приложился", async () => {
    const { queue } = setup({
      attach: async (_id, file) => {
        if (file.name === "big.png") throw new Error("Файл больше 10 МБ");
        return { id: "t1", key: "VED-1", files: [] };
      },
    });
    await queue.createWithFiles({
      boardId: "b1",
      body: { title: "Кнопка" },
      title: "Кнопка",
      files: [shot("a.png"), shot("big.png")],
    });
    await flush();

    expect(queue.getSnapshot()[0].problem).toBe(
      "«big.png» не приложился: Файл больше 10 МБ",
    );
  });

  it("задача не завелась — промис отклоняется, а без наблюдателя остаётся ошибка", async () => {
    const { queue } = setup({
      createTask: async () => {
        throw new Error("Нет доступа");
      },
    });
    const onCreated = vi.fn();

    await expect(
      queue.createWithFiles({
        boardId: "b1",
        body: { title: "Кнопка" },
        title: "Кнопка",
        files: [shot("1.png")],
        onCreated,
      }),
    ).rejects.toThrow("Нет доступа");

    expect(onCreated).not.toHaveBeenCalled();
    expect(queue.getSnapshot()).toEqual([
      expect.objectContaining({ phase: "failed", problem: "Нет доступа" }),
    ]);
  });

  it("задача без файлов: с доской на месте — ничего в списке не остаётся", async () => {
    const { queue } = setup();
    await queue.createWithFiles({
      boardId: "b1",
      body: { title: "Кнопка" },
      title: "Кнопка",
      files: [],
      watcher: { watching: () => true },
    });
    expect(queue.getSnapshot()).toEqual([]);
  });

  it("сообщает подписчикам о каждом шаге", async () => {
    const { queue } = setup();
    const phases: string[] = [];
    const stop = queue.subscribe(() =>
      phases.push(
        queue
          .getSnapshot()
          .map((job) => job.phase)
          .join(","),
      ),
    );
    await queue.createWithFiles({
      boardId: "b1",
      body: { title: "Кнопка" },
      title: "Кнопка",
      files: [shot("1.png")],
    });
    await flush();
    stop();

    expect(phases[0]).toBe("creating");
    expect(phases).toContain("uploading");
    expect(phases.at(-1)).toBe("done");
  });
});

describe("createWorkUploadQueue — вложения к задаче", () => {
  it("возвращает карточку последней загрузки и снимает задание при открытом окне", async () => {
    const { queue } = setup();
    const outcome = await queue.attach({
      boardId: "b1",
      taskId: "t1",
      taskKey: "VED-1",
      title: "Кнопка",
      files: [shot("1.png"), shot("2.png")],
      watcher: { watching: () => true },
    });

    expect(outcome).toEqual({
      last: { id: "t1", key: "VED-1", files: ["1.png", "2.png"] },
      problem: null,
    });
    expect(queue.getSnapshot()).toEqual([]);
  });

  it("задание видно сразу, до первого ответа сервера", () => {
    const gate = deferred<Task>();
    const { queue } = setup({ attach: () => gate.promise });
    void queue.attach({
      boardId: "b1",
      taskId: "t1",
      taskKey: "VED-1",
      title: "Кнопка",
      files: [shot("1.png")],
    });

    expect(queue.getSnapshot()).toEqual([
      expect.objectContaining({ phase: "uploading", taskId: "t1", total: 1 }),
    ]);
    gate.resolve({ id: "t1", key: "VED-1", files: [] });
  });

  it("после обрыва сети ждёт вкладку на экране и отправляет файл заново", async () => {
    let calls = 0;
    const waitBeforeRetry = vi.fn(async () => {});
    const { queue } = setup({
      attach: async () => {
        calls += 1;
        if (calls === 1)
          throw Object.assign(new Error("нет сети"), { status: 0 });
        return { id: "t1", key: "VED-1", files: ["1.png"] };
      },
      waitBeforeRetry,
    });

    const outcome = await queue.attach({
      boardId: "b1",
      taskId: "t1",
      taskKey: "VED-1",
      title: "Кнопка",
      files: [shot("1.png")],
    });

    expect(waitBeforeRetry).toHaveBeenCalledTimes(1);
    expect(calls).toBe(2);
    expect(outcome.problem).toBeNull();
  });

  it("ответ сервера не повторяет, а обрыв — не больше NETWORK_RETRIES раз", async () => {
    let calls = 0;
    const { queue } = setup({
      attach: async () => {
        calls += 1;
        throw Object.assign(new Error("нет сети"), { status: 0 });
      },
    });
    const outcome = await queue.attach({
      boardId: "b1",
      taskId: "t1",
      taskKey: "VED-1",
      title: "Кнопка",
      files: [shot("1.png")],
    });
    expect(calls).toBe(NETWORK_RETRIES + 1);
    expect(outcome.problem).toContain("«1.png» не приложился: нет сети");

    calls = 0;
    const server = setup({
      attach: async () => {
        calls += 1;
        throw Object.assign(new Error("Файл больше 10 МБ"), { status: 413 });
      },
    });
    await server.queue.attach({
      boardId: "b1",
      taskId: "t1",
      taskKey: "VED-1",
      title: "Кнопка",
      files: [shot("1.png")],
    });
    expect(calls).toBe(1);
  });

  it("dismiss убирает итог из списка", async () => {
    const { queue } = setup();
    await queue.attach({
      boardId: "b1",
      taskId: "t1",
      taskKey: "VED-1",
      title: "Кнопка",
      files: [shot("1.png")],
    });
    const [job] = queue.getSnapshot();
    queue.dismiss(job.id);
    expect(queue.getSnapshot()).toEqual([]);
  });
});

describe("подписи и мелочи очереди", () => {
  const base: WorkUploadJob = {
    id: "u1",
    boardId: "b1",
    href: null,
    taskKey: "VED-7",
    taskId: "t1",
    title: "Кнопка",
    total: 2,
    done: 0,
    phase: "uploading",
    problem: null,
  };

  it("describeUploadJob говорит, что происходит", () => {
    expect(describeUploadJob(base)).toBe(
      "Загружаем 2 файла в задачу VED-7: 1 из 2",
    );
    expect(
      describeUploadJob({ ...base, phase: "creating", taskKey: null }),
    ).toBe("Создаём задачу «Кнопка», потом загрузим 2 файла");
    expect(describeUploadJob({ ...base, phase: "done" })).toBe(
      "Загружено 2 файла в задачу VED-7",
    );
    expect(describeUploadJob({ ...base, phase: "done", total: 0 })).toBe(
      "Задача VED-7 добавлена",
    );
    expect(
      describeUploadJob({
        ...base,
        phase: "done",
        problem: "«a.png» не приложился",
      }),
    ).toBe("Задача VED-7: «a.png» не приложился");
    expect(
      describeUploadJob({
        ...base,
        phase: "failed",
        taskKey: null,
        problem: "Нет доступа",
      }),
    ).toBe("Задача «Кнопка» не добавлена: Нет доступа");
  });

  it("filesWord склоняет", () => {
    expect([1, 2, 5, 11, 21, 22, 112].map(filesWord)).toEqual([
      "1 файл",
      "2 файла",
      "5 файлов",
      "11 файлов",
      "21 файл",
      "22 файла",
      "112 файлов",
    ]);
  });

  it("taskHref добавляет ключ к адресу доски", () => {
    expect(taskHref("/work/planner/s1", "VED-7")).toBe(
      "/work/planner/s1?task=VED-7",
    );
    expect(taskHref("/work/planner/s1?x=1", "VED-7")).toBe(
      "/work/planner/s1?x=1&task=VED-7",
    );
    expect(taskHref(undefined, "VED-7")).toBeNull();
  });

  it("isNetworkFailure — только статус 0", () => {
    expect(isNetworkFailure({ status: 0 })).toBe(true);
    expect(isNetworkFailure({ status: 500 })).toBe(false);
    expect(isNetworkFailure(new Error("x"))).toBe(false);
  });
});
