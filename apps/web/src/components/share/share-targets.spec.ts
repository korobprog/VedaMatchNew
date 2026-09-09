import { describe, expect, it } from "vitest";
import { isOwnFile, messengerLink, shareText } from "./share-targets";

describe("messengerLink", () => {
  it("Telegram получает ссылку и текст порознь", () => {
    const link = messengerLink("telegram", "https://vm.ru/m/a", "Цитата");

    expect(link).toContain("t.me/share/url");
    expect(link).toContain(encodeURIComponent("https://vm.ru/m/a"));
    expect(link).toContain(encodeURIComponent("Цитата"));
  });

  it("WhatsApp получает одну строку, ссылка в конце — ради превью", () => {
    const link = messengerLink("whatsapp", "https://vm.ru/m/a", "Цитата");

    expect(link).toBe(
      `https://wa.me/?text=${encodeURIComponent("Цитата https://vm.ru/m/a")}`,
    );
  });

  it("ВКонтакте получает ссылку и заголовок", () => {
    expect(messengerLink("vk", "https://vm.ru/m/a", "Цитата")).toContain(
      "vk.com/share.php",
    );
  });
});

describe("shareText", () => {
  it("склеивает цитату, источник и ссылку пустыми строками", () => {
    expect(
      shareText({ text: "Цитата", source: "Гита 2.47", link: "https://vm.ru" }),
    ).toBe("Цитата\n\nГита 2.47\n\nhttps://vm.ru");
  });

  it("пустые части не оставляют лишних переносов", () => {
    expect(shareText({ text: "Цитата", source: "", link: null })).toBe("Цитата");
  });
});

describe("isOwnFile", () => {
  it("свой путь принимает", () => {
    expect(isOwnFile("/m/a/story")).toBe(true);
  });

  it("чужой адрес отвергает — иначе это открытый пересыльщик", () => {
    expect(isOwnFile("https://evil.example/x.jpg")).toBe(false);
    expect(isOwnFile("//evil.example/x.jpg")).toBe(false);
    expect(isOwnFile(null)).toBe(false);
    expect(isOwnFile("")).toBe(false);
  });
});
