import { describe, expect, it } from "vitest";
import { canFitOffline, formatBytes } from "./offline-capacity";

const MB = 1024 * 1024;
const GB = 1024 * MB;

describe("canFitOffline", () => {
  it("пускает запись, когда места с запасом", () => {
    const verdict = canFitOffline({ quota: 4 * GB, usage: 0 }, 100 * MB);
    expect(verdict.ok).toBe(true);
  });

  // Браузеры вытесняют задолго до нуля и чистят хранилище целиком, а не по
  // одному файлу: заполнить квоту под завязку — потерять всё сохранённое.
  it("оставляет запас и не отдаёт последние проценты квоты", () => {
    // Свободно формально 300 МБ, но 15% от гигабайта зарезервировано.
    const verdict = canFitOffline({ quota: 1 * GB, usage: 724 * MB }, 200 * MB);
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.reason).toMatch(/Не хватает места/);
  });

  it("та же запись проходит, когда занято меньше", () => {
    const verdict = canFitOffline({ quota: 1 * GB, usage: 100 * MB }, 200 * MB);
    expect(verdict.ok).toBe(true);
  });

  // Скачать сто мегабайт вслепую и упасть на записи хуже честного отказа.
  it("отказывает, когда браузер не сообщает квоту", () => {
    expect(canFitOffline({ usage: 0 }, 10 * MB).ok).toBe(false);
    expect(canFitOffline(null, 10 * MB).ok).toBe(false);
  });

  it("отказывает при неизвестном размере записи", () => {
    expect(canFitOffline({ quota: 4 * GB, usage: 0 }, 0).ok).toBe(false);
    expect(canFitOffline({ quota: 4 * GB, usage: 0 }, Number.NaN).ok).toBe(false);
  });

  it("переполненное хранилище не даёт отрицательного свободного места", () => {
    const verdict = canFitOffline({ quota: 1 * GB, usage: 2 * GB }, 1 * MB);
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.reason).toContain("свободно 0 МБ");
  });
});

describe("formatBytes", () => {
  it("меряет записи мегабайтами", () => {
    expect(formatBytes(60 * MB)).toBe("60 МБ");
  });

  it("переходит на гигабайты, когда их уже считают", () => {
    expect(formatBytes(2.5 * GB)).toBe("2,5 ГБ");
  });

  it("мелочь не округляет до нуля молча", () => {
    expect(formatBytes(300 * 1024)).toBe("меньше 1 МБ");
    expect(formatBytes(0)).toBe("0 МБ");
    expect(formatBytes(-5)).toBe("0 МБ");
  });
});
