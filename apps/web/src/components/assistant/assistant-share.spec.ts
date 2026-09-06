import { describe, expect, it } from "vitest";
import type { AssistantMessageDto } from "@vedamatch/shared";
import { buildShareHref, serviceLabel, titleOf } from "./assistant-share";

const message = (overrides: Partial<AssistantMessageDto> = {}): AssistantMessageDto => ({
  id: "m1",
  role: "assistant",
  text: "Вот что нашлось на Рынке:\nдве книги и сари.",
  cards: [],
  toolsUsed: [],
  failed: false,
  createdAt: "2026-09-06T10:00:00.000Z",
  ...overrides,
});

describe("buildShareHref", () => {
  it("ведёт на страницу отправки чата с карточкой ассистента", () => {
    const href = buildShareHref(message());
    expect(href).not.toBeNull();
    const params = new URL(`https://x${href}`).searchParams;
    expect(params.get("kind")).toBe("assistant");
    expect(params.get("title")).toBe("Вот что нашлось на Рынке:");
    expect(params.get("body")).toContain("две книги и сари");
    expect(params.get("sourceId")).toBe("m1");
  });

  it("неудавшийся или пустой ответ не отправляется", () => {
    expect(buildShareHref(message({ failed: true }))).toBeNull();
    expect(buildShareHref(message({ text: "   " }))).toBeNull();
  });

  it("длинный ответ обрезается, чтобы влезть в адрес", () => {
    const href = buildShareHref(message({ text: "слово ".repeat(1000) }))!;
    const body = new URL(`https://x${href}`).searchParams.get("body")!;
    expect(body.length).toBeLessThanOrEqual(1500);
    expect(body.endsWith("…")).toBe(true);
  });
});

describe("titleOf", () => {
  it("снимает маркеры списка и режет по слову", () => {
    expect(titleOf("- **Совет:** не спешите")).toBe("Совет: не спешите");
    const long = titleOf("Очень длинный первый абзац ответа ассистента который никак не помещается в заголовок карточки");
    expect(long.length).toBeLessThanOrEqual(81);
    expect(long.endsWith("…")).toBe(true);
  });

  it("пустая строка — запасной заголовок", () => {
    expect(titleOf("\n\nтекст")).toBe("Ответ ассистента");
  });
});

describe("serviceLabel", () => {
  it("знает сервисы портала, незнакомый слаг отдаёт как есть", () => {
    expect(serviceLabel("market")).toBe("Рынок");
    expect(serviceLabel("vedabase")).toBe("Библиотека");
    expect(serviceLabel("weird")).toBe("weird");
  });
});
