import { describe, expect, it } from "vitest";
import {
  CATEGORY_INFO_MAX_LENGTH,
  categoryInfo,
  linkifyInfoText,
  showCategoryInfoButton,
  tooLongInfoField,
  visibleInfoSections,
} from "./category-info";

describe("visibleInfoSections", () => {
  it("показывает только заполненные разделы, в порядке показа", () => {
    const sections = visibleInfoSections(
      categoryInfo({
        infoSchedule: "Пн 19:00",
        infoBio: "   ",
        infoContacts: " t.me/prabhu ",
        infoResources: null,
      }),
    );

    expect(sections).toEqual([
      { field: "infoContacts", label: "info.contacts", text: "t.me/prabhu" },
      { field: "infoSchedule", label: "info.schedule", text: "Пн 19:00" },
    ]);
  });

  it("пустой рубрике показывать нечего", () => {
    expect(visibleInfoSections(categoryInfo({}))).toEqual([]);
  });
});

describe("showCategoryInfoButton", () => {
  it("читатель видит «i», только когда есть что читать", () => {
    expect(showCategoryInfoButton({ canEdit: false })).toBe(false);
    expect(showCategoryInfoButton({ canEdit: false, infoBio: " " })).toBe(
      false,
    );
    expect(showCategoryInfoButton({ canEdit: false, infoBio: "Текст" })).toBe(
      true,
    );
  });

  it("тот, кто правит рубрику, видит «i» всегда — иначе негде заполнить", () => {
    expect(showCategoryInfoButton({ canEdit: true })).toBe(true);
  });
});

describe("tooLongInfoField", () => {
  it("меряет лимит после обрезки краёв", () => {
    const atLimit = "я".repeat(CATEGORY_INFO_MAX_LENGTH);
    expect(tooLongInfoField(categoryInfo({ infoBio: ` ${atLimit}\n` }))).toBe(
      null,
    );
    expect(
      tooLongInfoField(categoryInfo({ infoResources: `${atLimit}я` })),
    ).toBe("infoResources");
  });
});

describe("linkifyInfoText", () => {
  it("находит ссылки http и https посреди текста", () => {
    expect(
      linkifyInfoText("Сайт: https://example.org/a?b=1 и http://x.ru"),
    ).toEqual([
      { kind: "text", value: "Сайт: " },
      {
        kind: "link",
        value: "https://example.org/a?b=1",
        href: "https://example.org/a?b=1",
      },
      { kind: "text", value: " и " },
      { kind: "link", value: "http://x.ru", href: "http://x.ru" },
    ]);
  });

  it("точка и запятая за адресом — конец фразы, не ссылка", () => {
    expect(linkifyInfoText("См. https://x.org/page.")).toEqual([
      { kind: "text", value: "См. " },
      { kind: "link", value: "https://x.org/page", href: "https://x.org/page" },
      { kind: "text", value: "." },
    ]);
  });

  it("скобка отрезается, только если открывающей в адресе нет", () => {
    expect(linkifyInfoText("(см. https://x.org)")[1]).toMatchObject({
      value: "https://x.org",
    });
    expect(
      linkifyInfoText("https://ru.wikipedia.org/wiki/Гита_(книга)")[0],
    ).toMatchObject({ value: "https://ru.wikipedia.org/wiki/Гита_(книга)" });
  });

  it("не считает ссылкой адрес без протокола и голый протокол", () => {
    expect(
      linkifyInfoText("t.me/prabhu, javascript:alert(1), https://"),
    ).toEqual([
      { kind: "text", value: "t.me/prabhu, javascript:alert(1), https://" },
    ]);
  });

  it("сохраняет переводы строк в тексте", () => {
    expect(linkifyInfoText("Пн 19:00\nhttps://x.org\nСр")).toEqual([
      { kind: "text", value: "Пн 19:00\n" },
      { kind: "link", value: "https://x.org", href: "https://x.org" },
      { kind: "text", value: "\nСр" },
    ]);
  });
});
