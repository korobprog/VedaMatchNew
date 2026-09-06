import { describe, expect, it } from "vitest";
import { parseInstantMedia, serializeInstantMedia } from "./chat-send-settings";

describe("настройка мгновенной отправки вложений", () => {
  it("по умолчанию включена: фото уходит сразу, как в мессенджерах", () => {
    expect(parseInstantMedia(null)).toBe(true);
    expect(parseInstantMedia("")).toBe(true);
    expect(parseInstantMedia("мусор")).toBe(true);
  });

  it("включённое значение переживает запись и чтение", () => {
    expect(parseInstantMedia(serializeInstantMedia(true))).toBe(true);
    expect(parseInstantMedia(serializeInstantMedia(false))).toBe(false);
    expect(parseInstantMedia("true")).toBe(true);
  });
});
