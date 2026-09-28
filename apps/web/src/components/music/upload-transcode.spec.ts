import { describe, expect, it, vi } from "vitest";
import type { MusicUploadStateDto } from "@vedamatch/shared";
import { waitForTranscode } from "./upload-transcode";

const state = (
  over: Partial<MusicUploadStateDto> = {},
): MusicUploadStateDto => ({
  uploadId: "up1",
  state: "transcoding",
  trackId: null,
  failureReason: null,
  ...over,
});

const sleep = () => Promise.resolve();

describe("waitForTranscode", () => {
  it("спрашивает, пока не готово, и отдаёт итог", async () => {
    const fetchState = vi
      .fn()
      .mockResolvedValueOnce(state())
      .mockResolvedValueOnce(state())
      .mockResolvedValueOnce(state({ state: "completed", trackId: "t1" }));

    await expect(
      waitForTranscode("up1", fetchState, { sleep }),
    ).resolves.toMatchObject({ state: "completed", trackId: "t1" });
    expect(fetchState).toHaveBeenCalledTimes(3);
    expect(fetchState).toHaveBeenCalledWith("up1");
  });

  it("отказ — тоже итог", async () => {
    const fetchState = vi
      .fn()
      .mockResolvedValue(state({ state: "failed", failureReason: "плохо" }));

    await expect(
      waitForTranscode("up1", fetchState, { sleep }),
    ).resolves.toMatchObject({ state: "failed", failureReason: "плохо" });
  });

  it("сбой сети не обрывает ожидание", async () => {
    const fetchState = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(state({ state: "completed", trackId: "t1" }));

    await expect(
      waitForTranscode("up1", fetchState, { sleep }),
    ).resolves.toMatchObject({ trackId: "t1" });
  });

  it("время вышло — null, а не вечный опрос", async () => {
    const fetchState = vi.fn().mockResolvedValue(state());

    await expect(
      waitForTranscode("up1", fetchState, {
        sleep,
        intervalMs: 5,
        timeoutMs: 20,
      }),
    ).resolves.toBeNull();
    expect(fetchState).toHaveBeenCalledTimes(4);
  });

  it("форму закрыли — перестаёт спрашивать", async () => {
    const fetchState = vi.fn().mockResolvedValue(state());

    await expect(
      waitForTranscode("up1", fetchState, { sleep, cancelled: () => true }),
    ).resolves.toBeNull();
    expect(fetchState).not.toHaveBeenCalled();
  });
});
