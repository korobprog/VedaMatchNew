import { describe, expect, it } from "vitest";
import { contactLinks } from "./contact-links";

describe("contactLinks", () => {
  it("собирает ссылки из того, как человек записал контакт", () => {
    const links = contactLinks({
      telegram: "@aindra",
      whatsapp: "+7 (999) 000-00-00",
      phone: "+7 999 000 00 00",
    });

    expect(links.map((link) => [link.kind, link.href])).toEqual([
      ["telegram", "https://t.me/aindra"],
      ["whatsapp", "https://wa.me/79990000000"],
      ["phone", "tel:+79990000000"],
    ]);
  });

  it("готовую ссылку не трогает", () => {
    const links = contactLinks({
      telegram: "https://t.me/aindra_kirtan",
      whatsapp: "https://wa.me/79990000000",
    });

    expect(links[0].href).toBe("https://t.me/aindra_kirtan");
    expect(links[1].href).toBe("https://wa.me/79990000000");
  });

  it("MAX остаётся текстом: надёжной ссылки у него нет", () => {
    const [link] = contactLinks({ mx: "+79990000000" });

    expect(link.kind).toBe("mx");
    expect(link.value).toBe("+79990000000");
    expect(link.href).toBeNull();
  });

  it("порядок кнопок постоянный, а не тот, в котором заполняли", () => {
    const links = contactLinks({
      phone: "+79990000000",
      telegram: "@aindra",
    });

    expect(links.map((link) => link.kind)).toEqual(["telegram", "phone"]);
  });

  it("пустые поля пропускаются", () => {
    expect(contactLinks({ telegram: "  ", whatsapp: "" })).toEqual([]);
    expect(contactLinks({})).toEqual([]);
  });

  it("из мусора вместо номера ссылка не делается", () => {
    const [whatsapp] = contactLinks({ whatsapp: "звоните" });
    expect(whatsapp.href).toBeNull();
    // Значение всё равно показываем: администрация разберётся сама.
    expect(whatsapp.value).toBe("звоните");

    const [phone] = contactLinks({ phone: "+" });
    expect(phone.href).toBeNull();
  });
});
