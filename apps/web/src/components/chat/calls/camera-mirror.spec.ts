import { describe, expect, it } from "vitest";
import {
  facingFromTrackSettings,
  nextCameraFacing,
  shouldMirrorVideo,
} from "./camera-mirror";

describe("shouldMirrorVideo", () => {
  it("своё окошко с фронтальной камерой — зеркалим: человек привык к зеркалу", () => {
    expect(shouldMirrorVideo({ surface: "local-preview", facing: "user" })).toBe(
      true,
    );
  });

  it("своё окошко с тыловой камерой — не зеркалим (VED-347)", () => {
    expect(
      shouldMirrorVideo({ surface: "local-preview", facing: "environment" }),
    ).toBe(false);
  });

  it("камера неизвестна — считаем фронтальной, с неё звонок и начинается", () => {
    expect(shouldMirrorVideo({ surface: "local-preview", facing: null })).toBe(
      true,
    );
  });

  it("картинку собеседника не зеркалим никогда, ни при какой камере", () => {
    for (const facing of ["user", "environment", null] as const)
      expect(shouldMirrorVideo({ surface: "remote", facing })).toBe(false);
  });
});

describe("facingFromTrackSettings", () => {
  it("берёт камеру из настроек дорожки", () => {
    expect(facingFromTrackSettings({ facingMode: "environment" })).toBe(
      "environment",
    );
    expect(facingFromTrackSettings({ facingMode: "user" })).toBe("user");
  });

  it("веб-камера ноутбука молчит о стороне — считаем неизвестной и зеркалим", () => {
    expect(facingFromTrackSettings({})).toBeNull();
    expect(facingFromTrackSettings(null)).toBeNull();
    expect(facingFromTrackSettings(undefined)).toBeNull();
    expect(facingFromTrackSettings({ facingMode: "left" })).toBeNull();
    expect(
      shouldMirrorVideo({
        surface: "local-preview",
        facing: facingFromTrackSettings({}),
      }),
    ).toBe(true);
  });

  it("тыловая камера телефона в браузере не зеркалится (VED-347)", () => {
    expect(
      shouldMirrorVideo({
        surface: "local-preview",
        facing: facingFromTrackSettings({ facingMode: "environment" }),
      }),
    ).toBe(false);
  });
});

describe("nextCameraFacing", () => {
  it("переключение идёт по кругу фронтальная ↔ тыловая", () => {
    expect(nextCameraFacing("user")).toBe("environment");
    expect(nextCameraFacing("environment")).toBe("user");
  });
});
