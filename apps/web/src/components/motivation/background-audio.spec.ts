import { describe, expect, it } from "vitest";
import type { MotivationAudioDto } from "@vedamatch/shared";
import { hasBackgroundAudio, nextAudioIndex } from "./background-audio";

describe("nextAudioIndex", () => {
  it("идёт по списку и возвращается в начало", () => {
    expect(nextAudioIndex(3, 0)).toBe(1);
    expect(nextAudioIndex(3, 2)).toBe(0);
  });

  it("одна запись играет сама за собой: круг из одного", () => {
    // Из-за этого единственная запись в ленте зацикливается атрибутом
    // `loop`, а не сменой источника: индекс тот же, и React не пересоздаёт
    // элемент — фон замолкал после первого круга.
    expect(nextAudioIndex(1, 0)).toBe(0);
  });

  it("пустой список не роняет счётчик", () => {
    // Записи могли выключить, пока человек читал.
    expect(nextAudioIndex(0, 0)).toBe(0);
  });
});

describe("hasBackgroundAudio", () => {
  it("без записей кнопки быть не должно", () => {
    // Молчащая кнопка хуже её отсутствия — так же решено у озвучки.
    expect(hasBackgroundAudio([])).toBe(false);
    expect(hasBackgroundAudio(undefined)).toBe(false);
  });

  it("с записями — есть", () => {
    expect(hasBackgroundAudio([{ id: "a" } as MotivationAudioDto])).toBe(true);
  });
});
