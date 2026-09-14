import { describe, expect, it } from "vitest";
import { shareFileName } from "./share-file";

describe("shareFileName (VED-156)", () => {
  it("расширение совпадает с содержимым файла", () => {
    expect(shareFileName("/m/daily-2026-09-14/story", "image/jpeg")).toBe(
      "vedamatch-daily-2026-09-14.jpg",
    );
    expect(shareFileName("/m/daily-2026-09-14/story", "image/webp")).toBe(
      "vedamatch-daily-2026-09-14.webp",
    );
    expect(
      shareFileName("/m/daily-2026-09-14/story", "image/png; charset=binary"),
    ).toBe("vedamatch-daily-2026-09-14.png");
  });

  it("имя — по слагу карточки, а не по слову story", () => {
    expect(
      shareFileName(
        "/m/picture-65263442-c158-456c-92c0-18e00a01bf52/story",
        "image/jpeg",
      ),
    ).toBe("vedamatch-picture-65263442-c158-456c-92c0-18e00a01bf52.jpg");
  });

  it("чужие символы и параметры в пути не попадают в имя", () => {
    expect(shareFileName("/m/Кришна 108?v=2", "image/jpeg")).toBe(
      "vedamatch-108.jpg",
    );
  });

  it("неизвестный тип — jpg, пустой путь — card", () => {
    expect(shareFileName("/", "application/octet-stream")).toBe(
      "vedamatch-card.jpg",
    );
  });
});
