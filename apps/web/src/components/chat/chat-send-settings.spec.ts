import { describe, expect, it } from "vitest";
import { parseInstantMedia, serializeInstantMedia } from "./chat-send-settings";

describe("настройка мгновенной отправки вложений", () => {
  it("по умолчанию выключена: фото ждут кнопки, чтобы к ним приписать текст", () => {
    expect(parseInstantMedia(null)).toBe(false);
    expect(parseInstantMedia("")).toBe(false);
    expect(parseInstantMedia("мусор")).toBe(false);
  });

  it("включённое значение переживает запись и чтение", () => {
    expect(parseInstantMedia(serializeInstantMedia(true))).toBe(true);
    expect(parseInstantMedia(serializeInstantMedia(false))).toBe(false);
    expect(parseInstantMedia("true")).toBe(true);
  });
});
