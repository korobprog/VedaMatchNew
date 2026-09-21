import { describe, expect, it } from "vitest";
import { buildShuffleOrder } from "@/lib/music-queue";
import {
  planEndOfTrack,
  upcomingTrackId,
  type EndOfTrackState,
} from "./end-of-track-plan";

const base: EndOfTrackState = {
  queue: ["t1", "t2", "t3"],
  index: 0,
  shuffle: false,
  order: null,
  mode: "folder",
  autoplay: true,
  sleepStops: false,
};

describe("planEndOfTrack", () => {
  it("в режиме альбома идёт к следующей записи очереди", () => {
    expect(planEndOfTrack(base)).toEqual({
      kind: "next",
      index: 1,
      trackId: "t2",
    });
  });

  it("на последней записи альбома останавливается", () => {
    expect(planEndOfTrack({ ...base, index: 2 })).toEqual({
      kind: "stop",
      reason: "end",
    });
  });

  it("режим «одна запись» не идёт дальше даже посреди очереди", () => {
    expect(planEndOfTrack({ ...base, mode: "track" })).toEqual({
      kind: "stop",
      reason: "mode-track",
    });
  });

  it("снятый автопереход сильнее режима альбома", () => {
    expect(planEndOfTrack({ ...base, autoplay: false })).toEqual({
      kind: "stop",
      reason: "autoplay-off",
    });
  });

  // Сон-таймер отвечает раньше всех: человек просил тишины после этой записи.
  it("сон-таймер останавливает, даже когда дальше есть что играть", () => {
    expect(
      planEndOfTrack({ ...base, sleepStops: true, mode: "continue" }),
    ).toEqual({ kind: "stop", reason: "sleep" });
  });

  it("режим «дальше» в конце очереди просит следующий альбом", () => {
    expect(planEndOfTrack({ ...base, mode: "continue", index: 2 })).toEqual({
      kind: "nextAlbum",
    });
  });

  it("режим «дальше» посреди очереди сначала дослушивает её", () => {
    expect(planEndOfTrack({ ...base, mode: "continue", index: 1 })).toEqual({
      kind: "next",
      index: 2,
      trackId: "t3",
    });
  });

  it("перемешанная очередь идёт по своей перестановке", () => {
    const order = buildShuffleOrder(3, 42);
    const at = order[0];
    const plan = planEndOfTrack({
      ...base,
      shuffle: true,
      order,
      index: at,
    });

    expect(plan).toEqual({
      kind: "next",
      index: order[1],
      trackId: base.queue[order[1]],
    });
  });

  // Очередь правят прямо во время игры: гадать, что человек хотел услышать
  // вместо пропавшей записи, — хуже тишины.
  it("пустая очередь и дырка в ней приводят к остановке, а не к падению", () => {
    expect(planEndOfTrack({ ...base, queue: [], index: 0 })).toEqual({
      kind: "stop",
      reason: "end",
    });
    expect(
      planEndOfTrack({ ...base, queue: ["t1", undefined as never], index: 0 }),
    ).toEqual({ kind: "stop", reason: "end" });
  });
});

describe("upcomingTrackId", () => {
  it("называет следующую запись очереди", () => {
    expect(upcomingTrackId(base)).toBe("t2");
  });

  it("на краю очереди греть нечего", () => {
    expect(upcomingTrackId({ ...base, index: 2 })).toBeNull();
    expect(upcomingTrackId({ ...base, queue: [], index: 0 })).toBeNull();
  });

  // Прогрев не спрашивает про режим и настройки: заготовленный впустую
  // адрес стоит одного запроса, а его нехватка — паузы на переключении.
  it("греет следующую запись и в режиме «одна запись»", () => {
    const state: EndOfTrackState = { ...base, mode: "track", autoplay: false };

    expect(upcomingTrackId(state)).toBe("t2");
  });
});
