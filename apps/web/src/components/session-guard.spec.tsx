import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const replace = vi.fn();
const refresh = vi.fn();
let pathname = "/chat";
const refreshSession = vi.fn<() => Promise<boolean>>();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, refresh }),
  usePathname: () => pathname,
}));

vi.mock("@/lib/http-client", () => ({
  SESSION_EXPIRED_EVENT: "vedamatch:session-expired",
  refreshSession: () => refreshSession(),
}));

import { SESSION_RECHECK_DELAY_MS, SessionGuard } from "./session-guard";

function expire() {
  window.dispatchEvent(new Event("vedamatch:session-expired"));
}

async function passDelay() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(SESSION_RECHECK_DELAY_MS);
  });
}

describe("SessionGuard", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    replace.mockReset();
    refresh.mockReset();
    refreshSession.mockReset();
    pathname = "/chat";
    window.history.replaceState(null, "", "/chat?id=1");
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("сессия ожила при повторной проверке — человек остаётся на странице", async () => {
    refreshSession.mockResolvedValue(true);
    render(<SessionGuard />);

    act(() => expire());
    expect(refreshSession).not.toHaveBeenCalled();
    await passDelay();

    expect(refreshSession).toHaveBeenCalledOnce();
    expect(replace).not.toHaveBeenCalled();
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("сессии нет — уводит на главную с returnTo", async () => {
    refreshSession.mockResolvedValue(false);
    render(<SessionGuard />);

    act(() => expire());
    await passDelay();

    expect(replace).toHaveBeenCalledWith(
      `/?returnTo=${encodeURIComponent("/chat?id=1")}`,
    );
  });

  it("пачка событий — одна проверка", async () => {
    refreshSession.mockResolvedValue(false);
    render(<SessionGuard />);

    act(() => {
      expire();
      expire();
      expire();
    });
    await passDelay();

    expect(refreshSession).toHaveBeenCalledOnce();
    expect(replace).toHaveBeenCalledOnce();
  });

  it("на главной ничего не делает", async () => {
    pathname = "/";
    render(<SessionGuard />);

    act(() => expire());
    await passDelay();

    expect(refreshSession).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
  });
});
