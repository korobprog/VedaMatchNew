import { describe, expect, it } from "vitest";
import { toTelegramAppLink } from "./telegram-link";

describe("toTelegramAppLink", () => {
  it("канал открывается по имени", () => {
    expect(toTelegramAppLink("https://t.me/aindra_kirtan")).toBe(
      "tg://resolve?domain=aindra_kirtan",
    );
  });

  it("ссылка на пост доносит номер сообщения", () => {
    expect(toTelegramAppLink("https://t.me/aindra_kirtan/142")).toBe(
      "tg://resolve?domain=aindra_kirtan&post=142",
    );
  });

  it("веб-превью `/s/` ведёт в тот же канал", () => {
    expect(toTelegramAppLink("https://t.me/s/aindra_kirtan")).toBe(
      "tg://resolve?domain=aindra_kirtan",
    );
  });

  it("приглашение в закрытую группу — обе формы", () => {
    expect(toTelegramAppLink("https://t.me/+ty1cDob-LKhjOGly")).toBe(
      "tg://join?invite=ty1cDob-LKhjOGly",
    );
    expect(toTelegramAppLink("https://t.me/joinchat/AAAAAEkk2Wdo")).toBe(
      "tg://join?invite=AAAAAEkk2Wdo",
    );
  });

  it("`/+<цифры>` — это телефон, а не приглашение", () => {
    expect(toTelegramAppLink("https://t.me/+79001234567")).toBe(
      "tg://resolve?phone=79001234567",
    );
  });

  it("пост закрытого канала идёт через privatepost", () => {
    expect(toTelegramAppLink("https://t.me/c/1234567890/42")).toBe(
      "tg://privatepost?channel=1234567890&post=42",
    );
  });

  it("параметры адреса приложению не нужны", () => {
    expect(toTelegramAppLink("https://t.me/aindra_kirtan?single")).toBe(
      "tg://resolve?domain=aindra_kirtan",
    );
  });

  it("служебные разделы t.me остаются сайту", () => {
    expect(
      toTelegramAppLink("https://t.me/share/url?url=https://vedamatch.ru"),
    ).toBeNull();
    expect(toTelegramAppLink("https://t.me/addstickers/HareKrishna")).toBeNull();
  });

  it("без имени канала открывать нечего", () => {
    expect(toTelegramAppLink("https://t.me/")).toBeNull();
  });

  it("чужие адреса не трогаем — в Образовании их большинство", () => {
    expect(toTelegramAppLink("https://youtu.be/abcdefg")).toBeNull();
    expect(toTelegramAppLink("https://not-t.me/aindra_kirtan")).toBeNull();
    expect(toTelegramAppLink("вообще не адрес")).toBeNull();
  });

  it("чужая схема в адресе не проходит", () => {
    expect(toTelegramAppLink("javascript:alert(1)//t.me/x")).toBeNull();
  });
});
