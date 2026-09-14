import {
  endOfTrackAction,
  nextAlbumSlug,
  nextPlaybackMode,
  nextPlayStep,
  playbackModeLabel,
  playStepLabel,
  randomTrackId,
} from "./play-mode";
import { describe, expect, it } from "vitest";

// VED-132: три режима на плеере вместо «Повтора».
describe("nextPlaybackMode", () => {
  it("перебирает одна запись → альбом → дальше → снова одна запись", () => {
    expect(nextPlaybackMode("track")).toBe("folder");
    expect(nextPlaybackMode("folder")).toBe("continue");
    expect(nextPlaybackMode("continue")).toBe("track");
  });

  it("у каждого режима своё имя кнопки", () => {
    const labels = new Set(
      (["track", "folder", "continue"] as const).map(playbackModeLabel),
    );
    expect(labels.size).toBe(3);
  });
});

describe("endOfTrackAction", () => {
  it("«одна запись» останавливается, даже если в очереди есть ещё", () => {
    expect(endOfTrackAction({ mode: "track", hasNext: true })).toBe("stop");
  });

  it("«альбом» идёт по очереди и молчит в её конце", () => {
    expect(endOfTrackAction({ mode: "folder", hasNext: true })).toBe("next");
    expect(endOfTrackAction({ mode: "folder", hasNext: false })).toBe("stop");
  });

  it("«дальше» в конце очереди уходит к следующему альбому", () => {
    expect(endOfTrackAction({ mode: "continue", hasNext: true })).toBe("next");
    expect(endOfTrackAction({ mode: "continue", hasNext: false })).toBe(
      "nextAlbum",
    );
  });
});

describe("nextAlbumSlug", () => {
  const albums = [{ slug: "new" }, { slug: "middle" }, { slug: "old" }];

  it("берёт альбом, стоящий ниже в списке исполнителя", () => {
    expect(nextAlbumSlug(albums, "new")).toBe("middle");
    expect(nextAlbumSlug(albums, "middle")).toBe("old");
  });

  it("после последнего альбома — конец, по кругу не идёт", () => {
    expect(nextAlbumSlug(albums, "old")).toBeNull();
  });

  it("запись без альбома начинает с первого альбома исполнителя", () => {
    expect(nextAlbumSlug(albums, null)).toBe("new");
  });

  it("чужой альбом и исполнитель без альбомов — конец", () => {
    expect(nextAlbumSlug(albums, "сборник")).toBeNull();
    expect(nextAlbumSlug([], "new")).toBeNull();
  });
});

describe("nextPlayStep", () => {
  it("молчащий плеер: первое нажатие — одна запись", () => {
    expect(
      nextPlayStep({ firstTrackId: "a", queue: [], currentId: null }),
    ).toBe("single");
  });

  it("эта запись играет одна — следующее нажатие раскрывает список", () => {
    expect(
      nextPlayStep({ firstTrackId: "a", queue: ["a"], currentId: "a" }),
    ).toBe("all");
  });

  // Список уже раскрыт: нажатие возвращает к одной записи, а не повторяет всё.
  it("играет весь список — снова одна запись", () => {
    expect(
      nextPlayStep({ firstTrackId: "a", queue: ["a", "b", "c"], currentId: "a" }),
    ).toBe("single");
  });

  it("играет что-то чужое — начинаем с одной записи", () => {
    expect(
      nextPlayStep({ firstTrackId: "a", queue: ["x"], currentId: "x" }),
    ).toBe("single");
  });
});

describe("playStepLabel", () => {
  it("говорит про то, что случится по нажатию", () => {
    expect(playStepLabel("single")).toBe("Слушать один трек");
    expect(playStepLabel("all")).toBe("Слушать всё до конца");
  });
});

describe("randomTrackId", () => {
  it("берёт запись по броску", () => {
    expect(randomTrackId(["a", "b", "c"], () => 0)).toBe("a");
    expect(randomTrackId(["a", "b", "c"], () => 0.5)).toBe("b");
  });

  // Бросок в единицу не должен выходить за край списка.
  it("единица не выводит за последнюю запись", () => {
    expect(randomTrackId(["a", "b"], () => 1)).toBe("b");
  });

  it("пустой список играть нечем", () => {
    expect(randomTrackId([])).toBeNull();
  });
});
