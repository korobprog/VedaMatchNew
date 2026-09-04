import { describe, expect, it } from "vitest";
import { toTelegramAppLink } from "./telegram-link";

describe("toTelegramAppLink", () => {
  it("превращает приглашение в закрытую группу", () => {
    expect(toTelegramAppLink("https://t.me/+ty1cDob-LKhjOGly")).toBe(
      "tg://join?invite=ty1cDob-LKhjOGly",
    );
  });

  it("понимает старую форму приглашения", () => {
    expect(toTelegramAppLink("https://t.me/joinchat/AAAAAEkk2Wdo")).toBe(
      "tg://join?invite=AAAAAEkk2Wdo",
    );
  });

  it("после плюса из одних цифр — это номер телефона, а не хеш", () => {
    expect(toTelegramAppLink("https://t.me/+79001234567")).toBe(
      "tg://resolve?phone=79001234567",
    );
  });

  it("превращает открытый канал", () => {
    expect(toTelegramAppLink("https://t.me/aindra_kirtan")).toBe(
      "tg://resolve?domain=aindra_kirtan",
    );
  });

  it("сохраняет номер поста", () => {
    expect(toTelegramAppLink("https://t.me/aindra_kirtan/142")).toBe(
      "tg://resolve?domain=aindra_kirtan&post=142",
    );
  });

  it("снимает веб-превью со ссылки вида /s/<канал>", () => {
    expect(toTelegramAppLink("https://t.me/s/aindra_kirtan")).toBe(
      "tg://resolve?domain=aindra_kirtan",
    );
  });

  it("превращает пост закрытого канала", () => {
    expect(toTelegramAppLink("https://t.me/c/1234567890/42")).toBe(
      "tg://privatepost?channel=1234567890&post=42",
    );
  });

  it("принимает зеркала домена и www", () => {
    expect(toTelegramAppLink("https://www.telegram.me/aindra_kirtan")).toBe(
      "tg://resolve?domain=aindra_kirtan",
    );
  });

  it("игнорирует хвост запроса", () => {
    expect(toTelegramAppLink("https://t.me/aindra_kirtan?single")).toBe(
      "tg://resolve?domain=aindra_kirtan",
    );
  });

  it("не трогает служебные разделы", () => {
    expect(
      toTelegramAppLink("https://t.me/share/url?url=https://vedamatch.ru"),
    ).toBeNull();
    expect(
      toTelegramAppLink("https://t.me/addstickers/HareKrishna"),
    ).toBeNull();
  });

  it("не трогает корень домена", () => {
    expect(toTelegramAppLink("https://t.me/")).toBeNull();
  });

  it("не трогает чужие адреса", () => {
    expect(
      toTelegramAppLink("https://vedabase.io/ru/library/bg/2/13/"),
    ).toBeNull();
    expect(toTelegramAppLink("https://not-t.me/aindra_kirtan")).toBeNull();
  });

  it("не трогает мусор вместо адреса", () => {
    expect(toTelegramAppLink("@aindra_kirtan")).toBeNull();
    expect(toTelegramAppLink("")).toBeNull();
  });

  it("не трогает чужую схему", () => {
    expect(toTelegramAppLink("javascript:alert(1)//t.me/x")).toBeNull();
  });
});
