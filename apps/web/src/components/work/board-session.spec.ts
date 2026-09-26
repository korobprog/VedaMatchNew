import { describe, expect, it } from "vitest";
import {
  boardSessionKey,
  patchBoardSession,
  readBoardSession,
  without,
  type SessionStore,
} from "./board-session";

function memoryStore(): SessionStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
  };
}

const draft = {
  title: "Новое название",
  description: "Недописанное описание",
  columnId: "c1",
  sectionId: null,
  assigneeId: null,
  priority: "normal" as const,
  due: "",
};

describe("board session (VED-520)", () => {
  it("возвращает набранное после ухода в другое окно", () => {
    const store = memoryStore();
    patchBoardSession(store, "b1", (s) => ({
      ...s,
      composer: {
        columnId: "c1",
        description: "Задача, которую не успел сохранить",
        title: null,
        assigneeId: "u1",
        priority: "high",
      },
      openTaskId: "t1",
      taskDrafts: { t1: draft },
      comments: { t1: "ещё пишу" },
    }));

    const back = readBoardSession(store, "b1");
    expect(back.composer?.description).toBe(
      "Задача, которую не успел сохранить",
    );
    expect(back.openTaskId).toBe("t1");
    expect(back.taskDrafts.t1).toEqual(draft);
    expect(back.comments.t1).toBe("ещё пишу");
    // Доски друг другу не мешают.
    expect(readBoardSession(store, "b2").openTaskId).toBeNull();
  });

  it("сохранили и закрыли — запись стирается совсем", () => {
    const store = memoryStore();
    patchBoardSession(store, "b1", (s) => ({
      ...s,
      openTaskId: "t1",
      taskDrafts: { t1: draft },
    }));
    patchBoardSession(store, "b1", (s) => ({
      ...s,
      openTaskId: null,
      taskDrafts: without(s.taskDrafts, "t1"),
    }));
    expect(store.data.has(boardSessionKey("b1"))).toBe(false);
  });

  it("испорченная запись и отсутствие хранилища не роняют доску", () => {
    const store = memoryStore();
    store.data.set(boardSessionKey("b1"), "{не json");
    expect(readBoardSession(store, "b1").composer).toBeNull();
    expect(readBoardSession(null, "b1").openTaskId).toBeNull();
    expect(() => patchBoardSession(null, "b1", (s) => s)).not.toThrow();
  });
});
