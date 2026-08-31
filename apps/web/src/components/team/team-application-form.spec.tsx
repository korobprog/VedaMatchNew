import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TeamApplicationForm } from "./team-application-form";

describe("TeamApplicationForm", () => {
  it("отклоняет отправку без email и telegram", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<TeamApplicationForm />);

    await user.type(
      screen.getByRole("textbox", { name: "Расскажите о себе" }),
      "Пять лет пентестов",
    );
    await user.click(screen.getByRole("button", { name: "Отправить заявку" }));

    expect(
      screen.getByText(
        "Оставьте email или Telegram — иначе мы не сможем ответить",
      ),
    ).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("отправляет заявку и показывает подтверждение", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({
        id: "app-1",
        status: "submitted",
        createdAt: "2026-08-31T10:00:00.000Z",
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<TeamApplicationForm />);

    await user.type(
      screen.getByRole("textbox", { name: "Расскажите о себе" }),
      "Пять лет пентестов",
    );
    await user.type(
      screen.getByRole("textbox", { name: "Email для ответа" }),
      "sec@example.com",
    );
    await user.click(screen.getByRole("button", { name: "Отправить заявку" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/team/applications");
    expect(JSON.parse(String(init.body))).toMatchObject({
      role: "security",
      contactEmail: "sec@example.com",
      message: "Пять лет пентестов",
    });
    expect(await screen.findByText("Заявка отправлена")).toBeInTheDocument();
  });

  it("требует описание роли при выборе «Другое»", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<TeamApplicationForm />);

    await user.selectOptions(
      screen.getByRole("combobox", { name: "Роль" }),
      "other",
    );
    await user.type(
      screen.getByRole("textbox", { name: "Расскажите о себе" }),
      "Текст",
    );
    await user.type(
      screen.getByRole("textbox", { name: "Email для ответа" }),
      "a@example.com",
    );
    await user.click(screen.getByRole("button", { name: "Отправить заявку" }));

    expect(
      screen.getByText("Опишите роль, если её нет в списке"),
    ).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
