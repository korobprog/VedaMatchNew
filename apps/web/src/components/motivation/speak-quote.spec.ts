import { describe, expect, it } from "vitest";
import { buildSpokenQuote, spokenLanguage } from "./speak-quote";

function post(over: Record<string, unknown> = {}) {
  return {
    text: "Душа не рождается и не умирает.\n\nЭто разбор второй главы.",
    attributionSpeaker: "Прабхупада",
    attributionWork: "Бхагавад-гита",
    attributionLocator: "2.13",
    ...over,
  } as never;
}

describe("buildSpokenQuote", () => {
  it("читает цитату и подпись", () => {
    expect(buildSpokenQuote(post())).toContain("Душа не рождается и не умирает.");
    expect(buildSpokenQuote(post())).toContain("Прабхупада");
  });

  it("не читает пояснение: его читают глазами и возвращаются к строчке", () => {
    expect(buildSpokenQuote(post())).not.toContain("разбор второй главы");
  });

  it("обходится без подписи, когда её нет", () => {
    const bare = buildSpokenQuote(
      post({
        attributionSpeaker: null,
        attributionWork: null,
        attributionLocator: null,
      }),
    );

    expect(bare).toBe("Душа не рождается и не умирает.");
  });

  it("не спотыкается на пустом тексте", () => {
    expect(
      buildSpokenQuote(
        post({
          text: "",
          attributionSpeaker: null,
          attributionWork: null,
          attributionLocator: null,
        }),
      ),
    ).toBe("");
  });
});

describe("spokenLanguage", () => {
  it("русский текст читает русским голосом", () => {
    expect(spokenLanguage("Душа не умирает")).toBe("ru-RU");
  });

  it("латиницу — английским: русский голос читает «kṛṣṇa» как «кырышна»", () => {
    expect(spokenLanguage("nainam chindanti shastrani")).toBe("en-US");
  });
});
