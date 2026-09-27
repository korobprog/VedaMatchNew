import { describe, expect, it } from "vitest";
import { planCompactSound } from "./compact-sound";

describe("planCompactSound (VED-577)", () => {
  it("без эфира и записи кнопки нет", () => {
    expect(planCompactSound({ radio: null, player: null })).toBeNull();
    expect(
      planCompactSound({
        radio: { active: false, paused: false },
        player: { hasTrack: false, isPlaying: false },
      }),
    ).toBeNull();
  });

  it("играющий эфир выключает, стоящий на паузе — продолжает", () => {
    expect(
      planCompactSound({
        radio: { active: true, paused: false },
        player: { hasTrack: true, isPlaying: false },
      }),
    ).toMatchObject({ step: "radio-stop", playing: true });
    expect(
      planCompactSound({ radio: { active: true, paused: true }, player: null }),
    ).toMatchObject({ step: "radio-resume", playing: false });
  });

  it("без эфира ставит запись плеера на паузу и снимает с неё", () => {
    expect(
      planCompactSound({
        radio: { active: false, paused: false },
        player: { hasTrack: true, isPlaying: true },
      }),
    ).toMatchObject({ step: "player-pause", playing: true, label: "Пауза" });
    expect(
      planCompactSound({
        radio: null,
        player: { hasTrack: true, isPlaying: false },
      }),
    ).toMatchObject({ step: "player-resume", playing: false });
  });
});
