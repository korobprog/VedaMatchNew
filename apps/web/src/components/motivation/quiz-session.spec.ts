import { describe, expect, it } from "vitest";
import {
  INITIAL_QUIZ_STATE,
  freshQuizSeed,
  isFinished,
  nextQuestion,
  optionLook,
  pickAnswer,
  quizPreloadUrls,
  quizVerdict,
} from "./quiz-session";

const question = { answer: "2.11", options: ["4.7", "2.11", "9.22", "18.66"] };

describe("ход викторины", () => {
  it("верный ответ прибавляет очко", () => {
    expect(pickAnswer(INITIAL_QUIZ_STATE, question, "2.11")).toEqual({
      index: 0,
      picked: "2.11",
      score: 1,
    });
  });

  it("неверный — не прибавляет, но ответ запоминается", () => {
    expect(pickAnswer(INITIAL_QUIZ_STATE, question, "4.7")).toEqual({
      index: 0,
      picked: "4.7",
      score: 0,
    });
  });

  it("второй выбор после ответа ничего не меняет", () => {
    const wrong = pickAnswer(INITIAL_QUIZ_STATE, question, "4.7");
    expect(pickAnswer(wrong, question, "2.11")).toBe(wrong);
  });

  it("вариант не из списка не засчитывается", () => {
    expect(pickAnswer(INITIAL_QUIZ_STATE, question, "3.3")).toBe(
      INITIAL_QUIZ_STATE,
    );
  });

  it("дальше — только после ответа", () => {
    expect(nextQuestion(INITIAL_QUIZ_STATE, 3)).toBe(INITIAL_QUIZ_STATE);
    const answered = pickAnswer(INITIAL_QUIZ_STATE, question, "2.11");
    expect(nextQuestion(answered, 3)).toEqual({
      index: 1,
      picked: null,
      score: 1,
    });
  });

  it("после последнего вопроса раунд окончен", () => {
    const answered = pickAnswer(INITIAL_QUIZ_STATE, question, "2.11");
    const done = nextQuestion(answered, 1);
    expect(isFinished(done, 1)).toBe(true);
    expect(isFinished(INITIAL_QUIZ_STATE, 1)).toBe(false);
    expect(nextQuestion({ ...done, picked: "x" }, 1)).toEqual({
      ...done,
      picked: "x",
    });
  });
});

describe("вид вариантов", () => {
  it("до ответа все одинаковые", () => {
    for (const option of question.options)
      expect(optionLook(option, question, null)).toBe("idle");
  });

  it("угадал: верный подсвечен, остальные гаснут", () => {
    expect(optionLook("2.11", question, "2.11")).toBe("correct");
    expect(optionLook("4.7", question, "2.11")).toBe("dim");
  });

  it("не угадал: выбранный неверный, верный всё равно показан", () => {
    expect(optionLook("4.7", question, "4.7")).toBe("wrong");
    expect(optionLook("2.11", question, "4.7")).toBe("missed");
    expect(optionLook("9.22", question, "4.7")).toBe("dim");
  });
});

describe("итог", () => {
  it("оценка по доле угаданного", () => {
    expect(quizVerdict(10, 10)).toBe("Все стихи узнаны!");
    expect(quizVerdict(7, 10)).toBe("Отличный результат");
    expect(quizVerdict(4, 10)).toBe("Хорошее начало");
    expect(quizVerdict(1, 10)).toBe("Есть что перечитать");
    expect(quizVerdict(0, 0)).toBe("");
  });

  it("семя раунда — восемь знаков из букв и цифр", () => {
    expect(freshQuizSeed(() => 0)).toBe("00000000");
    expect(freshQuizSeed(() => 0.999999)).toMatch(/^[0-9a-z]{8}$/);
  });
});

describe("quizPreloadUrls (VED-627)", () => {
  const round = ["a.png", "b.png", "c.png", "d.png"].map((imageUrl) => ({
    imageUrl,
  }));

  it("подгружает две следующие картинки", () => {
    expect(quizPreloadUrls(round, 0)).toEqual(["b.png", "c.png"]);
    expect(quizPreloadUrls(round, 1)).toEqual(["c.png", "d.png"]);
  });

  it("в конце раунда — сколько осталось, после него — ничего", () => {
    expect(quizPreloadUrls(round, 2)).toEqual(["d.png"]);
    expect(quizPreloadUrls(round, 3)).toEqual([]);
    expect(quizPreloadUrls(round, 4)).toEqual([]);
  });

  it("не повторяет текущую и одинаковые", () => {
    const same = [
      { imageUrl: "a.png" },
      { imageUrl: "a.png" },
      { imageUrl: "b.png" },
      { imageUrl: "b.png" },
    ];
    expect(quizPreloadUrls(same, 0, 3)).toEqual(["b.png"]);
    expect(
      quizPreloadUrls([{ imageUrl: "a.png" }, { imageUrl: "" }], 0),
    ).toEqual([]);
  });
});
