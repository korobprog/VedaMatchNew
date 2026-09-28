import { describe, expect, it } from "vitest";
import {
  LINEAGE_ABBREVIATIONS,
  abbreviationHelpLabel,
  abbreviationIn,
  abbreviationsIn,
} from "./lineage-abbr";

/* VED-634: «убери расшифровку ISKCON, оставь только аббревиатуру … то же
   самое сделай для Международного общества чистой бхакти-йоги. Обе
   аббревиатуры оставь на английском, а расшифровки на русском». */
describe("аббревиатуры линий (VED-634)", () => {
  it("ISKCON и IPBYS — по-английски, расшифровки — по-русски", () => {
    expect(LINEAGE_ABBREVIATIONS).toEqual([
      { abbr: "ISKCON", expansion: "Международное общество сознания Кришны" },
      {
        abbr: "IPBYS",
        expansion: "Международное общество чистой бхакти-йоги",
      },
    ]);
  });

  it("находит аббревиатуру отдельным словом в любой подписи", () => {
    expect(abbreviationIn("ISKCON")?.abbr).toBe("ISKCON");
    expect(abbreviationIn("Гаудия-матх — IPBYS")?.abbr).toBe("IPBYS");
    expect(abbreviationsIn("ISKCON, IPBYS").map((a) => a.abbr)).toEqual([
      "ISKCON",
      "IPBYS",
    ]);
    expect(abbreviationIn("Паривары")).toBeNull();
    expect(abbreviationIn("ISKCONX")).toBeNull();
    expect(abbreviationIn(null)).toBeNull();
  });

  it("имя кнопки «?»", () => {
    expect(abbreviationHelpLabel("ISKCON")).toBe("Что такое ISKCON");
  });
});
