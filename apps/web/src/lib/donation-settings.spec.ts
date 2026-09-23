import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  donateTileView,
  loadDonationSettings,
  readDonationSettings,
  resetDonationSettings,
} from "./donation-settings";

const ENABLED = {
  enabled: true,
  text: "",
  requisites: [{ kind: "sbp", label: "СБП", value: "+7 900 000-00-00" }],
};

function stubFetch(answer: () => unknown) {
  const mock = vi.fn().mockImplementation(() => Promise.resolve(answer()));
  vi.stubGlobal("fetch", mock);
  return mock;
}

beforeEach(() => {
  resetDonationSettings();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/* VED-380: решение отделено от загрузки — именно оно отвечает за то, что
   плитка не появляется позже соседей. */
describe("donateTileView", () => {
  it("ответа ещё нет — плитка на месте и ведёт на страницу с реквизитами", () => {
    expect(donateTileView(undefined)).toBe("pending");
  });

  it("реквизиты есть — та самая шторка", () => {
    expect(donateTileView(ENABLED)).toBe("sheet");
  });

  it("пожертвования выключены — кнопки нет вовсе", () => {
    expect(donateTileView({ enabled: false, text: "", requisites: [] })).toBe(
      "hidden",
    );
  });

  it("включены, но реквизитов нет — показывать нечего", () => {
    expect(donateTileView({ enabled: true, text: "", requisites: [] })).toBe(
      "hidden",
    );
  });
});

describe("loadDonationSettings", () => {
  it("спрашивает сервер один раз, сколько бы кнопок ни ждало", async () => {
    const fetchMock = stubFetch(() => ({ ok: true, json: async () => ENABLED }));

    const [first, second] = await Promise.all([
      loadDonationSettings(),
      loadDonationSettings(),
    ]);
    await loadDonationSettings();

    expect(first).toEqual(ENABLED);
    expect(second).toEqual(ENABLED);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("известное отдаётся без похода на сервер — тем же рендером", async () => {
    stubFetch(() => ({ ok: true, json: async () => ENABLED }));
    expect(readDonationSettings()).toBeUndefined();

    await loadDonationSettings();

    expect(readDonationSettings()).toEqual(ENABLED);
  });

  it("«сервер не ответил» — это не «пожертвования выключены»", async () => {
    const failing = stubFetch(() => {
      throw new Error("сеть");
    });

    expect(await loadDonationSettings()).toBeUndefined();
    expect(readDonationSettings()).toBeUndefined();
    expect(failing).toHaveBeenCalledTimes(1);

    // Следующее открытие панели спрашивает заново, а не остаётся с пустотой.
    stubFetch(() => ({ ok: true, json: async () => ENABLED }));
    expect(await loadDonationSettings()).toEqual(ENABLED);
  });

  it("ошибку сервера тоже не запоминаем", async () => {
    stubFetch(() => ({ ok: false, json: async () => ({}) }));

    expect(await loadDonationSettings()).toBeUndefined();
    expect(readDonationSettings()).toBeUndefined();
  });
});
