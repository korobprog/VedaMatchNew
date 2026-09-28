import { describe, expect, it, vi } from "vitest";
import {
  createChecklistQueue,
  joinChecklistText,
  pendingItems,
} from "./checklist-queue";

function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  let reject: (cause: unknown) => void = () => {};
  const promise = new Promise<T>((ok, fail) => {
    resolve = ok;
    reject = fail;
  });
  return { promise, resolve, reject };
}

describe("очередь пунктов чек-листа (VED-624)", () => {
  it("пункт виден как летящий сразу и уходит из списка, когда дошёл", async () => {
    const reply = deferred<string>();
    const queue = createChecklistQueue<string>({ add: () => reply.promise });

    const sent = queue.add("t1", "  Проверить на телефоне ");

    expect(pendingItems(queue.getSnapshot(), "t1")).toEqual([
      expect.objectContaining({ text: "Проверить на телефоне" }),
    ]);
    reply.resolve("карточка");
    await expect(sent).resolves.toEqual({
      taskId: "t1",
      text: "Проверить на телефоне",
      task: "карточка",
      problem: null,
    });
    expect(pendingItems(queue.getSnapshot(), "t1")).toEqual([]);
    expect(queue.settled("t1")).toBe(1);
  });

  it("пункты одной задачи уходят по порядку, каждый — после предыдущего", async () => {
    const first = deferred<string>();
    const add = vi
      .fn<(taskId: string, text: string) => Promise<string>>()
      .mockReturnValueOnce(first.promise)
      .mockResolvedValueOnce("второй");
    const queue = createChecklistQueue<string>({ add });

    const one = queue.add("t1", "Первый");
    const two = queue.add("t1", "Второй");
    await Promise.resolve();

    expect(add).toHaveBeenCalledTimes(1);
    expect(add).toHaveBeenLastCalledWith("t1", "Первый");
    first.resolve("первый");
    await one;
    await two;
    expect(add).toHaveBeenLastCalledWith("t1", "Второй");
  });

  it("отказ сервера не теряет текст и не держит очередь", async () => {
    const add = vi
      .fn<(taskId: string, text: string) => Promise<string>>()
      .mockRejectedValueOnce(new Error("Сеть недоступна"))
      .mockResolvedValueOnce("ок");
    const queue = createChecklistQueue<string>({ add });

    const failed = await queue.add("t1", "Не дошёл");
    const next = await queue.add("t1", "Дошёл");

    expect(failed).toEqual({
      taskId: "t1",
      text: "Не дошёл",
      task: null,
      problem: "Сеть недоступна",
    });
    expect(next.problem).toBeNull();
    expect(pendingItems(queue.getSnapshot(), "t1")).toEqual([]);
  });

  it("пустой текст ничего не отправляет", async () => {
    const add = vi.fn();
    const queue = createChecklistQueue<string>({ add });

    await queue.add("t1", "   ");

    expect(add).not.toHaveBeenCalled();
    expect(queue.getSnapshot()).toEqual({});
  });

  it("подписчики узнают о каждом изменении", async () => {
    const queue = createChecklistQueue<string>({
      add: () => Promise.resolve("ок"),
    });
    const listener = vi.fn();
    const stop = queue.subscribe(listener);

    await queue.add("t1", "Пункт");

    expect(listener).toHaveBeenCalledTimes(2);
    stop();
    await queue.add("t1", "Ещё");
    expect(listener).toHaveBeenCalledTimes(2);
  });
});

describe("joinChecklistText", () => {
  it("не дошедший пункт встаёт перед недописанным", () => {
    expect(joinChecklistText("Не дошёл", "Пишу дальше")).toBe(
      "Не дошёл\nПишу дальше",
    );
    expect(joinChecklistText("Не дошёл", "")).toBe("Не дошёл");
    expect(joinChecklistText("", "Пишу")).toBe("Пишу");
  });
});
