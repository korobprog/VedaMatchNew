import { describe, expect, it } from "vitest";
import {
  isOwnFile,
  messengerAppLink,
  messengerLink,
  opensInApp,
  shareText,
  shouldFallBackToSite,
} from "./share-targets";

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

describe("messengerAppLink", () => {
  it("Telegram зовётся собственной схемой, а не сайтом", () => {
    const link = messengerAppLink("telegram", "https://vm.ru/m/a", "Цитата");

    expect(link?.startsWith("tg://msg_url?")).toBe(true);
    expect(link).toContain(encodeURIComponent("https://vm.ru/m/a"));
    expect(link).toContain(encodeURIComponent("Цитата"));
  });

  it("WhatsApp — одной строкой, как и на сайте", () => {
    const link = messengerAppLink("whatsapp", "https://vm.ru/m/a", "Цитата");

    expect(link?.startsWith("whatsapp://send?")).toBe(true);
    expect(link).toContain(
      encodeURIComponent("Цитата https://vm.ru/m/a"),
    );
  });

  it("у ВКонтакте схемы нет — остаётся сайт", () => {
    expect(messengerAppLink("vk", "https://vm.ru/m/a", "Цитата")).toBeNull();
  });
});

describe("opensInApp", () => {
  it("во вкладке браузера остаёмся на сайте", () => {
    expect(opensInApp("browser", "tg://msg_url?url=x")).toBe(false);
  });

  it("в установленном портале зовём приложение", () => {
    expect(opensInApp("standalone", "tg://msg_url?url=x")).toBe(true);
    expect(opensInApp("fullscreen", "tg://msg_url?url=x")).toBe(true);
    expect(opensInApp("minimal-ui", "tg://msg_url?url=x")).toBe(true);
  });

  it("без схемы звать некого", () => {
    expect(opensInApp("standalone", null)).toBe(false);
  });
});

describe("shouldFallBackToSite", () => {
  it("окно ушло в фон — мессенджер открылся, сайт не нужен", () => {
    expect(shouldFallBackToSite(true)).toBe(false);
  });

  it("окно на месте — приложения нет, ведём на сайт", () => {
    expect(shouldFallBackToSite(false)).toBe(true);
  });
});
