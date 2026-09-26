import { describe, expect, it } from "vitest";
import { mergeRemoteTrack, pickVideoTransceiver } from "./group-video-link";

const audio = { kind: "audio", id: "a1" };
const video = { kind: "video", id: "v1" };
const both = ["audio", "video"] as const;

describe("поток собеседника собирается из дорожек", () => {
  it("видеодорожка без потока попадает в поток — ровно то, что терялось", () => {
    const withAudio = mergeRemoteTrack([], audio, both);
    expect(withAudio).toEqual([audio]);
    expect(mergeRemoteTrack(withAudio!, video, both)).toEqual([audio, video]);
  });

  it("повтор той же дорожки поток не пересобирает", () => {
    expect(mergeRemoteTrack([audio, video], { ...video }, both)).toBeNull();
  });

  it("новая дорожка того же вида заменяет прежнюю", () => {
    const next = { kind: "video", id: "v2" };
    expect(mergeRemoteTrack([audio, video], next, both)).toEqual([audio, next]);
  });

  it("чужой вид и пустое событие ничего не меняют", () => {
    expect(mergeRemoteTrack([], audio, ["video"])).toBeNull();
    expect(mergeRemoteTrack([audio], null, both)).toBeNull();
  });
});

describe("видеосекция отвечающего", () => {
  const own = { kind: "video", mid: null, stopped: false, direction: "sendrecv" };
  const fromOffer = { kind: "video", mid: "1", stopped: false, direction: "recvonly" };
  const mic = { kind: "audio", mid: "0", stopped: false, direction: "sendrecv" };

  it("берёт созданную offer'ом и открывает ей отдачу", () => {
    expect(pickVideoTransceiver([mic, fromOffer])).toEqual({
      index: 1,
      setDirection: "sendrecv",
    });
  });

  it("несогласованный свой трансивер не берёт", () => {
    expect(pickVideoTransceiver([mic, own, fromOffer])?.index).toBe(2);
    expect(pickVideoTransceiver([mic, own])).toBeNull();
  });

  it("уже открытой секции направление не трогает", () => {
    expect(
      pickVideoTransceiver([{ ...fromOffer, direction: "sendrecv" }]),
    ).toEqual({ index: 0, setDirection: null });
  });

  it("остановленный не подходит", () => {
    expect(pickVideoTransceiver([{ ...fromOffer, stopped: true }])).toBeNull();
  });
});
