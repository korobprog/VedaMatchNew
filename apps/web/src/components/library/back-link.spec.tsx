import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
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
});

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
    render(
      <BackLink locale="ru" fallbackHref="/library/katha" skipHistory />,
    );

    fireEvent.click(screen.getByRole("button"));

    expect(replace).toHaveBeenCalledWith("/library/katha");
    expect(back).not.toHaveBeenCalled();
  });
});
