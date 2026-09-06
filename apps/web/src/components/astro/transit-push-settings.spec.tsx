import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TransitPushSettings } from "./transit-push-settings";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;

beforeEach(() => {
  fetchMock = vi.fn<typeof fetch>();
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

describe("TransitPushSettings", () => {
  it("говорит, во сколько и по какому поясу придёт", () => {
    render(
      <TransitPushSettings
        initial={{ pushHour: 9, timeZone: "Asia/Vladivostok", timeZoneLocked: false }}
      />,
    );
    expect(screen.getByText(/Придёт в 09:00 по поясу Asia\/Vladivostok/)).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Часовой пояс" })).toHaveValue("");
    expect(screen.getByText(/Автоматически — Asia\/Vladivostok/)).toBeInTheDocument();
  });

  it("смена часа уходит на сервер и обновляет подпись", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({ pushHour: 7, timeZone: "Asia/Vladivostok", timeZoneLocked: false }),
        { status: 200 },
      ),
    );
    render(
      <TransitPushSettings
        initial={{ pushHour: 9, timeZone: "Asia/Vladivostok", timeZoneLocked: false }}
      />,
    );

    await user.selectOptions(screen.getByLabelText(/Во сколько/), "7");

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/astro/today/preferences");
    expect(init?.method).toBe("PUT");
    expect(JSON.parse(String(init?.body))).toEqual({ pushHour: 7 });
    expect(await screen.findByText(/Придёт в 07:00/)).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Сохранено.");
  });

  it("ручной пояс фиксируется через профиль, а не через Астрологию", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(new Response("{}", { status: 200 }));
    render(
      <TransitPushSettings
        initial={{ pushHour: 9, timeZone: "Asia/Vladivostok", timeZoneLocked: false }}
      />,
    );

    await user.selectOptions(screen.getByRole("combobox", { name: "Часовой пояс" }), "Europe/Moscow");

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/profile");
    expect(init?.method).toBe("PATCH");
    expect(JSON.parse(String(init?.body))).toEqual({ timeZone: "Europe/Moscow" });
    expect(await screen.findByText(/по поясу Europe\/Moscow/)).toBeInTheDocument();
    expect(screen.getByText(/Выбран вручную/)).toBeInTheDocument();
  });

  it("возврат к автоматике снимает фиксацию и досылает зону устройства", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(new Response("{}", { status: 200 }));
    render(
      <TransitPushSettings
        initial={{ pushHour: 9, timeZone: "Europe/Moscow", timeZoneLocked: true }}
      />,
    );
    const select = screen.getByRole("combobox", { name: "Часовой пояс" });
    expect(select).toHaveValue("Europe/Moscow");

    await user.selectOptions(select, "");

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toMatchObject({
      timeZone: null,
    });
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body))).toEqual({
      detectedTimeZone: "Asia/Vladivostok",
    });
    expect(await screen.findByText(/по поясу Asia\/Vladivostok/)).toBeInTheDocument();
  });
});
