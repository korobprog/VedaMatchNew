import { describe, expect, it } from "vitest";
import { decideRemoteMediaView } from "./remote-media-view";

describe("decideRemoteMediaView", () => {
  // ---- VED-359: «в браузере не было видеосвязи, только аудио» ----

  it("видеозвонок: <video> в документе ещё до того, как пришёл поток", () => {
    // Ровно та поломка: элемент появлялся только в фазе `active`, а
    // `srcObject` присваивался раньше — в момент `ontrack`, когда
    // привязывать было не к чему.
    expect(
      decideRemoteMediaView({ kind: "video", hasRemoteStream: false, phase: "connecting" }),
    ).toEqual({ mountVideo: true, showVideo: false, mountAudio: false });
  });

  it("видеозвонок: поток пришёл, соединение ещё не встало — элемент есть, картинки нет", () => {
    expect(
      decideRemoteMediaView({ kind: "video", hasRemoteStream: true, phase: "connecting" }),
    ).toEqual({ mountVideo: true, showVideo: false, mountAudio: false });
  });

  it("видеозвонок в разговоре — картинка собеседника", () => {
    expect(
      decideRemoteMediaView({ kind: "video", hasRemoteStream: true, phase: "active" }),
    ).toEqual({ mountVideo: true, showVideo: true, mountAudio: false });
  });

  it("видеозвонок без потока в разговоре — аватар, а не чёрный кадр", () => {
    expect(
      decideRemoteMediaView({ kind: "video", hasRemoteStream: false, phase: "active" }),
    ).toEqual({ mountVideo: true, showVideo: false, mountAudio: false });
  });

  it("видеозвонок завершился — картинку убираем, элемент не трогаем", () => {
    expect(
      decideRemoteMediaView({ kind: "video", hasRemoteStream: true, phase: "ended" }),
    ).toEqual({ mountVideo: true, showVideo: false, mountAudio: false });
  });

  it("аудиозвонок: <video> не нужен, голос идёт через <audio>", () => {
    for (const phase of ["outgoing", "connecting", "active", "ended"] as const)
      expect(decideRemoteMediaView({ kind: "audio", hasRemoteStream: true, phase })).toEqual({
        mountVideo: false,
        showVideo: false,
        mountAudio: true,
      });
  });

  it("два элемента на одном потоке одновременно не заводим — было бы эхо", () => {
    for (const kind of ["audio", "video"] as const)
      for (const phase of ["connecting", "active"] as const) {
        const view = decideRemoteMediaView({ kind, hasRemoteStream: true, phase });
        expect(view.mountVideo && view.mountAudio).toBe(false);
      }
  });
});
