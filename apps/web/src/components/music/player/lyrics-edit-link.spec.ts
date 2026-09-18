import { describe, expect, it } from "vitest";
import {
  buildTrackLyricsEditHref,
  wantsLyricsEdit,
} from "./lyrics-edit-link";

describe("buildTrackLyricsEditHref", () => {
  it("ведёт на страницу записи с параметром, открывающим форму правки текста", () => {
    expect(buildTrackLyricsEditHref("abc-123")).toBe(
      "/music/tracks/abc-123?edit=lyrics",
    );
  });
});

describe("wantsLyricsEdit", () => {
  it("true, когда параметр стоит на «lyrics»", () => {
    expect(wantsLyricsEdit(new URLSearchParams("edit=lyrics"))).toBe(true);
  });

  it("false без параметра", () => {
    expect(wantsLyricsEdit(new URLSearchParams(""))).toBe(false);
  });

  it("false при другом значении того же параметра", () => {
    expect(wantsLyricsEdit(new URLSearchParams("edit=cover"))).toBe(false);
  });
});
