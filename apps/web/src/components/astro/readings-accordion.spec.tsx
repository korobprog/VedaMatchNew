import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AstroReadingsDto, AstroSectionState } from "@vedamatch/shared";
import { ReadingsAccordion } from "./readings-accordion";
import * as clientApi from "@/lib/astro-client-api";

const section = (
  overrides: Partial<AstroSectionState> = {},
): AstroSectionState => ({
  section: "overview",
  title: "Общий обзор",
  text: null,
  available: true,
  blockedBy: null,
  requires: [],
  ...overrides,
});

const dto = (
  sections: AstroSectionState[],
  quota: Partial<AstroReadingsDto["quota"]> = {},
): AstroReadingsDto => ({
  sections,
  quota: {
    readingsLeft: 3,
    readingsPerDay: 3,
    aiAvailable: true,
    budgetHalted: false,
    ...quota,
  },
});

afterEach(() => vi.restoreAllMocks());

describe("ReadingsAccordion", () => {
  it("показывает остаток квоты", () => {
    render(<ReadingsAccordion initial={dto([section()])} />);
    expect(screen.getByText(/Осталось сегодня: 3 из 3/)).toBeInTheDocument();
  });

  it("при снятом лимите не пишет «0 из 0»", () => {
    // Ноль в потолке означает «без лимита»; показать его числом было бы ложью.
    render(
      <ReadingsAccordion
        initial={dto([], { readingsPerDay: 0, readingsLeft: 0 })}
      />,
    );

    expect(screen.getByText(/Без ограничения на бете/)).toBeInTheDocument();
    expect(screen.queryByText(/Осталось сегодня/)).toBeNull();
  });

  it("при недоступном ИИ не обещает генерацию", () => {
    render(
      <ReadingsAccordion
        initial={dto([section({ available: false, blockedBy: "ai_unavailable" })], {
          aiAvailable: false,
        })}
      />,
    );
    expect(screen.getByText(/временно недоступны/)).toBeInTheDocument();
  });

  it("не запрашивает разбор, пока раздел не раскрыт", () => {
    const spy = vi.spyOn(clientApi, "generateAstroReading");
    render(<ReadingsAccordion initial={dto([section()])} />);
    expect(spy).not.toHaveBeenCalled();
  });

  it("генерирует раздел при раскрытии и показывает текст", async () => {
    const spy = vi
      .spyOn(clientApi, "generateAstroReading")
      .mockResolvedValue(section({ text: "Лагна в Вришабхе даёт основательность" }));

    render(<ReadingsAccordion initial={dto([section()])} />);
    await userEvent.click(screen.getByRole("button", { name: /Общий обзор/ }));

    expect(spy).toHaveBeenCalledWith("overview");
    expect(
      await screen.findByText("Лагна в Вришабхе даёт основательность"),
    ).toBeInTheDocument();
  });

  it("уменьшает остаток квоты после генерации", async () => {
    vi.spyOn(clientApi, "generateAstroReading").mockResolvedValue(
      section({ text: "Разбор" }),
    );

    render(<ReadingsAccordion initial={dto([section()])} />);
    await userEvent.click(screen.getByRole("button", { name: /Общий обзор/ }));

    expect(await screen.findByText(/Осталось сегодня: 2 из 3/)).toBeInTheDocument();
  });

  it("повторное раскрытие уже готового раздела не обращается к серверу", async () => {
    const spy = vi.spyOn(clientApi, "generateAstroReading");

    render(
      <ReadingsAccordion initial={dto([section({ text: "Уже готово" })])} />,
    );
    await userEvent.click(screen.getByRole("button", { name: /Общий обзор/ }));

    expect(screen.getByText("Уже готово")).toBeInTheDocument();
    expect(spy).not.toHaveBeenCalled();
  });

  it("объясняет, каких именно данных не хватает", async () => {
    render(
      <ReadingsAccordion
        initial={dto([
          section({
            title: "Лагна и характер",
            available: false,
            blockedBy: "requires_data",
            requires: ["lagna"],
          }),
        ])}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /Лагна/ }));

    expect(screen.getByText(/не хватает: лагна/)).toBeInTheDocument();
  });

  it("не тратит запрос на заблокированный раздел", async () => {
    const spy = vi.spyOn(clientApi, "generateAstroReading");

    render(
      <ReadingsAccordion
        initial={dto([
          section({ available: false, blockedBy: "quota_exhausted" })
        ], { readingsLeft: 0 })}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /Общий обзор/ }));

    expect(spy).not.toHaveBeenCalled();
    expect(screen.getByText(/квота разборов исчерпана/)).toBeInTheDocument();
  });

  it("показывает сообщение сервера, когда генерация не удалась", async () => {
    vi.spyOn(clientApi, "generateAstroReading").mockRejectedValue(
      new clientApi.AstroReadingError("Дневная квота исчерпана", 403),
    );

    render(<ReadingsAccordion initial={dto([section()])} />);
    await userEvent.click(screen.getByRole("button", { name: /Общий обзор/ }));

    expect(
      await screen.findByText("Дневная квота исчерпана"),
    ).toBeInTheDocument();
  });
});
