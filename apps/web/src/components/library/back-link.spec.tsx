import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BackLink } from "./back-link";

const back = vi.fn();
const push = vi.fn();
const replace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ back, push, replace }),
}));

beforeEach(() => {
  back.mockReset();
  push.mockReset();
  replace.mockReset();
  vi.useFakeTimers();
});

afterEach(() => {
  // Слушатель шага назад снимается по таймеру — дожидаемся его, чтобы он не
  // перешёл в следующий тест.
  vi.runAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/** Будто браузер сделал шаг назад и пришёл на `path`. */
function landOn(path: string) {
  window.history.replaceState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

describe("BackLink", () => {
  it("возвращает по истории, чтобы сохранить фильтры и место в ленте", () => {
    window.history.pushState({}, "", "/library/entry/e1");
    render(<BackLink locale="ru" fallbackHref="/library" />);

    fireEvent.click(screen.getByRole("button"));

    expect(back).toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
  });

  // VED-91: позади в истории — форма добавления, и «назад» уводил в редакцию.
  it("после публикации ведёт в раздел материала мимо истории", () => {
    window.history.pushState({}, "", "/library/entry/e1?created=1");
    render(<BackLink locale="ru" fallbackHref="/library/katha" skipHistory />);

    fireEvent.click(screen.getByRole("button"));

    expect(replace).toHaveBeenCalledWith("/library/katha");
    expect(back).not.toHaveBeenCalled();
  });

  // VED-397: «рубрика → форма → рубрика», и «Назад» уводил в заполнение поста.
  it("проходит форму добавления и ту же рубрику насквозь", () => {
    const historyBack = vi
      .spyOn(window.history, "back")
      .mockImplementation(() => {});
    window.history.pushState({}, "", "/library/propovedniki");
    render(<BackLink locale="ru" fallbackHref="/library" />);

    fireEvent.click(screen.getByRole("button"));
    expect(back).toHaveBeenCalledTimes(1);

    landOn("/library/add");
    expect(historyBack).toHaveBeenCalledTimes(1);
    landOn("/library/propovedniki");
    expect(historyBack).toHaveBeenCalledTimes(2);
    landOn("/library");
    expect(historyBack).toHaveBeenCalledTimes(2);

    // Дальше слушатель снят: обычная навигация назад его не трогает.
    landOn("/library/add");
    expect(historyBack).toHaveBeenCalledTimes(2);
  });

  it("из формы возвращает к выбору режима", () => {
    const historyBack = vi
      .spyOn(window.history, "back")
      .mockImplementation(() => {});
    window.history.pushState({}, "", "/library/add/simple");
    render(<BackLink locale="ru" fallbackHref="/library/add" />);

    fireEvent.click(screen.getByRole("button"));
    landOn("/library/add");

    expect(historyBack).not.toHaveBeenCalled();
  });

  it("уводит на запасной адрес, если позади остались только формы", () => {
    vi.spyOn(window.history, "back").mockImplementation(() => {});
    window.history.pushState({}, "", "/library/propovedniki");
    render(<BackLink locale="ru" fallbackHref="/library" />);

    fireEvent.click(screen.getByRole("button"));
    landOn("/library/add");
    // Следующего popstate нет — истории позади не осталось.
    vi.advanceTimersByTime(1500);

    expect(replace).toHaveBeenCalledWith("/library");
  });
});
