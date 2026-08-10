import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AstroAdminUsageDto, AstroSettingsDto } from "@vedamatch/shared";
import { AdminAstroForm } from "./admin-astro-form";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const settings: AstroSettingsDto = {
  enabled: true,
  aiEnabled: true,
  dailyReadingsPerUser: 3,
  dailyTokensPerUser: 20000,
  dailyTokenBudget: 2000000,
  dailyCostLimitUsdCents: 1000,
  transitPushEnabled: true,
};

const usage = (overrides: Partial<AstroAdminUsageDto> = {}): AstroAdminUsageDto => ({
  days: [],
  today: { tokensIn: 0, tokensOut: 0, costUsdCents: 0, halted: false },
  topConsumers: [],
  ...overrides,
});

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => ({}) });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe("AdminAstroForm", () => {
  it("показывает расход за сегодня против лимита", () => {
    render(
      <AdminAstroForm
        initialSettings={settings}
        usage={usage({
          today: {
            tokensIn: 1000,
            tokensOut: 500,
            costUsdCents: 25,
            halted: false,
          },
        })}
      />,
    );
    expect(screen.getByText(/1[\s ]500 токенов/)).toBeInTheDocument();
    expect(screen.getByText(/\$0\.25/)).toBeInTheDocument();
  });

  it("кнопка снятия остановки появляется только при остановке", () => {
    const { rerender } = render(
      <AdminAstroForm initialSettings={settings} usage={usage()} />,
    );
    expect(
      screen.queryByRole("button", { name: /Снять остановку/ }),
    ).not.toBeInTheDocument();

    rerender(
      <AdminAstroForm
        initialSettings={settings}
        usage={usage({
          today: {
            tokensIn: 9,
            tokensOut: 9,
            costUsdCents: 0,
            halted: true,
          },
        })}
      />,
    );
    expect(
      screen.getByRole("button", { name: /Снять остановку/ }),
    ).toBeInTheDocument();
  });

  it("объясняет, что при остановке карта продолжает работать", () => {
    render(
      <AdminAstroForm
        initialSettings={settings}
        usage={usage({
          today: { tokensIn: 0, tokensOut: 0, costUsdCents: 0, halted: true },
        })}
      />,
    );
    expect(screen.getByText(/Карта, даши и готовые разборы работают/)).toBeInTheDocument();
  });

  it("снятие остановки отправляет POST", async () => {
    render(
      <AdminAstroForm
        initialSettings={settings}
        usage={usage({
          today: { tokensIn: 0, tokensOut: 0, costUsdCents: 0, halted: true },
        })}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /Снять остановку/ }));

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/admin/astro/resume"),
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("сохраняет изменённые лимиты", async () => {
    render(<AdminAstroForm initialSettings={settings} usage={usage()} />);

    const field = screen.getByLabelText(/Разборов на пользователя/);
    await userEvent.clear(field);
    await userEvent.type(field, "10");
    await userEvent.click(screen.getByRole("button", { name: /Сохранить лимиты/ }));

    const body = JSON.parse(
      (fetchMock.mock.calls[0][1] as RequestInit).body as string,
    ) as AstroSettingsDto;
    expect(body.dailyReadingsPerUser).toBe(10);
  });

  it("переключатель аварийного выключателя уходит в запрос", async () => {
    render(<AdminAstroForm initialSettings={settings} usage={usage()} />);

    await userEvent.click(screen.getByLabelText(/Генерация разборов включена/));
    await userEvent.click(screen.getByRole("button", { name: /Сохранить лимиты/ }));

    const body = JSON.parse(
      (fetchMock.mock.calls[0][1] as RequestInit).body as string,
    ) as AstroSettingsDto;
    expect(body.aiEnabled).toBe(false);
  });

  it("показывает сообщение сервера при отказе", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 400,
      json: () => Promise.resolve({ message: "Поле dailyTokenBudget слишком велико" }),
    });

    render(<AdminAstroForm initialSettings={settings} usage={usage()} />);
    await userEvent.click(screen.getByRole("button", { name: /Сохранить лимиты/ }));

    expect(
      await screen.findByText("Поле dailyTokenBudget слишком велико"),
    ).toBeInTheDocument();
  });

  it("выводит топ потребителей с именами", () => {
    render(
      <AdminAstroForm
        initialSettings={settings}
        usage={usage({
          topConsumers: [
            {
              userId: "u1",
              name: "Иван",
              email: "ivan@example.com",
              readings: 5,
              tokens: 5000,
            },
          ],
        })}
      />,
    );
    expect(screen.getByText("Иван")).toBeInTheDocument();
    expect(screen.getByText("ivan@example.com")).toBeInTheDocument();
  });
});
