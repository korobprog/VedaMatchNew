import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Сторож за копией очереди.
 *
 * `apps/web/src/lib/music-queue.ts` — намеренный дубль
 * `apps/api/src/modules/music/music-queue.ts`: контракт сервисного модуля не
 * даёт общего модуля между приложениями, а считать следующий трек сервер и
 * браузер обязаны одинаково. Разъехаться такие копии успевают мгновенно —
 * эта разошлась через пять минут после создания, на первом же прогоне
 * форматтера.
 *
 * Сравнивается всё, кроме ведущего комментария: он у копий разный намеренно
 * (в вебовой сказано, что она копия).
 */
const ROOT = join(__dirname, "..", "..", "..", "..");

function withoutLeadingDoc(source: string): string {
  const end = source.indexOf("*/");
  return source.slice(end + 2).trimStart();
}

describe("очередь плеера продублирована один в один", () => {
  it("тело модуля совпадает с серверным", () => {
    const web = readFileSync(join(__dirname, "music-queue.ts"), "utf8");
    const api = readFileSync(
      join(ROOT, "apps", "api", "src", "modules", "music", "music-queue.ts"),
      "utf8",
    );

    expect(withoutLeadingDoc(web)).toBe(withoutLeadingDoc(api));
  });

  it("вебовая копия честно называет себя копией", () => {
    const web = readFileSync(join(__dirname, "music-queue.ts"), "utf8");

    expect(web).toContain("Копия `apps/api/src/modules/music/music-queue.ts`");
  });
});
