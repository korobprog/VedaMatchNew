import { render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TimeZoneSync } from "./time-zone-sync";

let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;

beforeEach(() => {
  localStorage.clear();
  fetchMock = vi
    .fn<typeof fetch>()
    .mockResolvedValue(new Response("{}", { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(Intl.DateTimeFormat.prototype, "resolvedOptions").mockReturnValue({
    timeZone: "Asia/Vladivostok",
    locale: "ru",
    calendar: "gregory",
    numberingSystem: "latn",
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("TimeZoneSync", () => {
  it("отправляет зону устройства в профиль и запоминает её", async () => {
    render(<TimeZoneSync />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/profile");
    expect(init?.method).toBe("PATCH");
    expect(JSON.parse(String(init?.body))).toEqual({ timeZone: "Asia/Vladivostok" });
    await waitFor(() =>
      expect(localStorage.getItem("vm_time_zone_synced")).toBe("Asia/Vladivostok"),
    );
  });

  it("уже отправленную зону второй раз не шлёт", async () => {
    localStorage.setItem("vm_time_zone_synced", "Asia/Vladivostok");

    render(<TimeZoneSync />);

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("переезд в другой пояс отправляет заново", async () => {
    localStorage.setItem("vm_time_zone_synced", "Europe/Moscow");

    render(<TimeZoneSync />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  });
});
