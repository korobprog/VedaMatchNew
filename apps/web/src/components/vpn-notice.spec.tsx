import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VpnNotice } from "./vpn-notice";
import {
  VPN_FAILURE_THRESHOLD,
  VPN_PROBE_DELAY_MS,
  VPN_PROBE_INTERVAL_MS,
} from "@/lib/vpn-hint";

/** Прокрутить столько проб, сколько нужно для появления плашки. */
async function runProbes(count: number) {
  await act(async () => {
    vi.advanceTimersByTime(VPN_PROBE_DELAY_MS);
  });
  for (let i = 1; i < count; i += 1) {
    await act(async () => {
      vi.advanceTimersByTime(VPN_PROBE_INTERVAL_MS);
    });
  }
}

describe("VpnNotice", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    window.sessionStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("молчит, пока API отвечает", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 200 })));

    render(<VpnNotice />);
    await runProbes(VPN_FAILURE_THRESHOLD + 1);

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("предупреждает про VPN, когда запросы к порталу не доходят", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));

    render(<VpnNotice />);
    await runProbes(VPN_FAILURE_THRESHOLD);

    expect(screen.getByRole("status")).toHaveTextContent("включён VPN");
  });

  it("одной неудачи не хватает", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));

    render(<VpnNotice />);
    await runProbes(1);

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("закрытая плашка не возвращается в этой вкладке", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));

    render(<VpnNotice />);
    await runProbes(VPN_FAILURE_THRESHOLD);
    fireEvent.click(screen.getByRole("button", { name: "Закрыть предупреждение" }));

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    // Следующая проба тоже неудачная — плашка всё равно молчит.
    await act(async () => {
      vi.advanceTimersByTime(VPN_PROBE_INTERVAL_MS);
    });
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(window.sessionStorage.getItem("vm_vpn_hint_dismissed")).toBe("1");
  });
});
