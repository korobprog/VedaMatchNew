import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MotivationQuizDto } from "@vedamatch/shared";
import { MotivationQuiz } from "./motivation-quiz";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const quiz: MotivationQuizDto = {
  seed: "s1",
  available: 2,
  questions: [
    {
      id: "a",
      slug: "post-a",
      imageUrl: "https://cdn/a.webp",
      answer: "2.11",
      options: ["4.7", "2.11", "9.22", "18.66"],
      text: "Мудрые не скорбят ни о живых, ни о мёртвых.",
    },
    {
      id: "b",
      slug: "post-b",
      imageUrl: "https://cdn/b.webp",
      answer: "4.7",
      options: ["4.7", "2.13", "3.5", "6.5"],
      text: "",
    },
  ],
};

describe("MotivationQuiz", () => {
  beforeEach(() => push.mockReset());

  it("показывает картинку и четыре номера стиха, вопрос — только для скринридера", () => {
    render(<MotivationQuiz quiz={quiz} />);

    expect(
      screen.getByRole("img", { name: "Иллюстрация к стиху Бхагавад-гиты" }),
    ).toHaveAttribute("src", "https://cdn/a.webp");
    expect(
      screen.getByRole("group", {
        name: "Какой стих отображает эта картинка?",
      }),
    ).toBeInTheDocument();
    for (const option of ["4.7", "2.11", "9.22", "18.66"])
      expect(
        screen.getByRole("button", { name: `Стих ${option}` }),
      ).toBeEnabled();
    expect(screen.getByText(/Вопрос/)).toHaveTextContent("Вопрос 1 из 2");
  });

  it("верный ответ: «Верно», очко и текст стиха", async () => {
    const user = userEvent.setup();
    render(<MotivationQuiz quiz={quiz} />);

    await user.click(screen.getByRole("button", { name: "Стих 2.11" }));

    expect(screen.getByRole("status")).toHaveTextContent(
      "Верно — это стих 2.11.",
    );
    expect(screen.getByText(/Угадано/)).toHaveTextContent("Угадано: 1");
    expect(
      screen.getByRole("button", { name: "Стих 2.11 — ваш ответ, верно" }),
    ).toBeDisabled();
    expect(screen.getByText(/Мудрые не скорбят/)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Открыть в ленте" }),
    ).toHaveAttribute("href", "/motivation?post=post-a");
    expect(screen.getByRole("button", { name: "Дальше" })).toHaveFocus();
  });

  it("неверный ответ: «Неверно» и правильный вариант подсвечен", async () => {
    const user = userEvent.setup();
    render(<MotivationQuiz quiz={quiz} />);

    await user.click(screen.getByRole("button", { name: "Стих 9.22" }));

    expect(screen.getByRole("status")).toHaveTextContent(
      "Неверно. Это стих 2.11.",
    );
    expect(
      screen.getByRole("button", { name: "Стих 9.22 — ваш ответ, неверно" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Стих 2.11 — правильный ответ" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Угадано/)).toHaveTextContent("Угадано: 0");
  });

  it("проходит раунд до итогов и начинает новый с новым семенем", async () => {
    const user = userEvent.setup();
    render(<MotivationQuiz quiz={quiz} />);

    await user.click(screen.getByRole("button", { name: "Стих 2.11" }));
    await user.click(screen.getByRole("button", { name: "Дальше" }));
    expect(screen.getByText(/Вопрос/)).toHaveTextContent("Вопрос 2 из 2");
    await user.click(screen.getByRole("button", { name: "Стих 3.5" }));
    await user.click(screen.getByRole("button", { name: "Итоги" }));

    expect(screen.getByText("Хорошее начало")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Ещё раунд" }));
    expect(push).toHaveBeenCalledWith(
      expect.stringMatching(/^\/motivation\/quiz\?seed=[0-9a-z]{8}$/),
    );
  });

  it("без вопросов — объяснение, а не пустой экран", () => {
    render(<MotivationQuiz quiz={{ seed: "", available: 0, questions: [] }} />);
    expect(
      screen.getByText("Иллюстраций к стихам Гиты пока нет"),
    ).toBeInTheDocument();
  });
});
