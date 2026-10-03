import { afterEach, describe, expect, it, vi } from "vitest";
import type { MusicRadioSharedTrackDto } from "@vedamatch/shared";
import { getSharedRadioTrack } from "./music-radio-server-api";

const dto = {
  track: { id: "t1", title: "Gauranga", artist: { name: "Atmasfera" } },
} as unknown as MusicRadioSharedTrackDto;

function ok(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as unknown as Response;
}

function fail(status: number): Response {
  return { ok: false, status, json: async () => ({}) } as unknown as Response;
}

afterEach(() => {
  vi.restoreAllMocks();
});

/* VED-718: превью ссылки — это карточка из ответа API, и мессенджер
 * запоминает её на сутки: сбой на первом крауле оставляет в чате превью без
 * трека и исполнителя. Транзиентный сбой обязан повторяться. */
describe("getSharedRadioTrack", () => {
  it("повторяет запрос после 5xx: первый сбой не отравляет превью", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(fail(502))
      .mockResolvedValueOnce(ok(dto));

    await expect(getSharedRadioTrack("t1")).resolves.toEqual(dto);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("повторяет запрос после сетевого сбоя", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValueOnce(new TypeError("network down"))
      .mockResolvedValueOnce(ok(dto));

    await expect(getSharedRadioTrack("t1")).resolves.toEqual(dto);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("404 — записи нет: без повтора, null", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(fail(404));

    await expect(getSharedRadioTrack("t1")).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("оба опыта неудачны — null", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new TypeError("network down"));

    await expect(getSharedRadioTrack("t1")).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
