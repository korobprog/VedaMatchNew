import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StageScopeToggle } from "./stage-scope-toggle";

const refresh = vi.fn();
const apiFetch = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

vi.mock("@/lib/http-client", () => ({
  apiFetch: (...args: unknown[]) => apiFetch(...args),
}));

afterEach(() => {
  refresh.mockClear();
  apiFetch.mockReset();
});

const NAME = "Материалы всех ступеней";

describe("StageScopeToggle (VED-575)", () => {
  it("без самоидентификации кнопки нет: человек и так видит всё", () => {
    const { container } = render(
      <StageScopeToggle stage={null} showAll={false} />,
    );
    expect(container.innerHTML).toBe("");
  });

  it("состояние — в aria-pressed, подсказка называет ступень", () => {
    render(<StageScopeToggle stage="yogi" showAll={false} />);
    const button = screen.getByRole("button", { name: NAME });
    expect(button.getAttribute("aria-pressed")).toBe("false");
    expect(button.getAttribute("title")).toContain("«Йог»");
  });

  it("нажатие пишет выбор в портальный профиль и перечитывает главную", async () => {
    apiFetch.mockResolvedValue({ ok: true, text: async () => "" });
    render(<StageScopeToggle stage="yogi" showAll={false} />);

    await userEvent.click(screen.getByRole("button", { name: NAME }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    const [url, init] = apiFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/profile$/);
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body as string)).toEqual({ showAllStages: true });
    expect(
      screen.getByRole("button", { name: NAME }).getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("ошибка возвращает прежнее состояние", async () => {
    apiFetch.mockResolvedValue({ ok: false, text: async () => "500" });
    render(<StageScopeToggle stage="seeker" showAll />);

    await userEvent.click(screen.getByRole("button", { name: NAME }));

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: NAME }).getAttribute("title"),
      ).toContain("Не удалось"),
    );
    expect(
      screen.getByRole("button", { name: NAME }).getAttribute("aria-pressed"),
    ).toBe("true");
    expect(refresh).not.toHaveBeenCalled();
  });
});
