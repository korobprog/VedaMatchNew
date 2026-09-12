import { nextPlayStep, playStepLabel, randomTrackId } from "./play-mode";
import { describe, expect, it } from "vitest";

describe("nextPlayStep", () => {
  it("молчащий плеер: первое нажатие — одна запись", () => {
    expect(
      nextPlayStep({ firstTrackId: "a", queue: [], currentId: null }),
    ).toBe("single");
  });

  it("эта запись играет одна — следующее нажатие раскрывает список", () => {
    expect(
      nextPlayStep({ firstTrackId: "a", queue: ["a"], currentId: "a" }),
    ).toBe("all");
  });

  // Список уже раскрыт: нажатие возвращает к одной записи, а не повторяет всё.
  it("играет весь список — снова одна запись", () => {
    expect(
      nextPlayStep({ firstTrackId: "a", queue: ["a", "b", "c"], currentId: "a" }),
    ).toBe("single");
  });

  it("играет что-то чужое — начинаем с одной записи", () => {
    expect(
      nextPlayStep({ firstTrackId: "a", queue: ["x"], currentId: "x" }),
    ).toBe("single");
  });
});

describe("playStepLabel", () => {
  it("говорит про то, что случится по нажатию", () => {
    expect(playStepLabel("single")).toBe("Слушать один трек");
    expect(playStepLabel("all")).toBe("Слушать всё до конца");
  });
});

describe("randomTrackId", () => {
  it("берёт запись по броску", () => {
    expect(randomTrackId(["a", "b", "c"], () => 0)).toBe("a");
    expect(randomTrackId(["a", "b", "c"], () => 0.5)).toBe("b");
  });

  // Бросок в единицу не должен выходить за край списка.
  it("единица не выводит за последнюю запись", () => {
    expect(randomTrackId(["a", "b"], () => 1)).toBe("b");
  });

  it("пустой список играть нечем", () => {
    expect(randomTrackId([])).toBeNull();
  });
});
