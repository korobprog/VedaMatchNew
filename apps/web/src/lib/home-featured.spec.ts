import { describe, expect, it } from "vitest";
import type { ServiceCard } from "@vedamatch/shared";
import {
  assignHomeFeaturedSlot,
  homeFeaturedOptions,
  parseHomeFeatured,
  resolveHomeFeatured,
  serializeHomeFeatured,
} from "./home-featured";

function service(slug: string, over: Partial<ServiceCard> = {}): ServiceCard {
  return {
    id: `id-${slug}`,
    slug,
    name: slug,
    nameEn: null,
    description: "",
    iconUrl: null,
    url: `/${slug}`,
    status: "active",
    category: "",
    requiresDevoteeVerification: false,
    ...over,
  };
}

const CATALOG = [
  service("union"),
  service("chat"),
  service("music"),
  service("library"),
  service("travel", { status: "coming_soon" }),
];

const keys = (list: { key: string }[]) => list.map((item) => item.key);

describe("homeFeaturedOptions", () => {
  it("offers active services and calls right after chat", () => {
    expect(keys(homeFeaturedOptions(CATALOG))).toEqual([
      "union",
      "chat",
      "calls",
      "music",
      "library",
    ]);
  });

  // Кнопка наверху обещает самое ходовое — «Скоро» ведёт в пустоту.
  it("leaves out services that are not open yet", () => {
    expect(keys(homeFeaturedOptions(CATALOG))).not.toContain("travel");
  });

  it("still offers calls when chat is not in the catalog", () => {
    expect(keys(homeFeaturedOptions([service("music")]))).toEqual([
      "music",
      "calls",
    ]);
  });
});

describe("resolveHomeFeatured", () => {
  const options = homeFeaturedOptions(CATALOG);

  it("keeps the buttons people had before anyone configured them", () => {
    expect(keys(resolveHomeFeatured(null, options))).toEqual([
      "chat",
      "music",
      "calls",
    ]);
  });

  it("shows the saved choice in the saved order", () => {
    expect(
      keys(resolveHomeFeatured(["library", "union", "chat"], options)),
    ).toEqual(["library", "union", "chat"]);
  });

  // Сервис из выбора могли выключить — ряд не должен остаться с дырой.
  it("fills a slot whose service is gone with a default one", () => {
    expect(
      keys(resolveHomeFeatured(["library", "vanished", "union"], options)),
    ).toEqual(["library", "union", "chat"]);
  });

  it("never shows the same service twice", () => {
    expect(
      keys(resolveHomeFeatured(["music", "music", "music"], options)),
    ).toEqual(["music", "chat", "calls"]);
  });

  it("shows fewer buttons only when there is less to choose from", () => {
    const few = homeFeaturedOptions([service("music")]);
    expect(keys(resolveHomeFeatured(null, few))).toEqual(["music", "calls"]);
  });
});

describe("home featured cookie", () => {
  it("reads back what was written for the same person", () => {
    const raw = serializeHomeFeatured("u1", ["library", "union", "chat"]);
    expect(parseHomeFeatured(raw, "u1")).toEqual(["library", "union", "chat"]);
  });

  // Общий планшет общины: второй вошедший не должен получить чужие кнопки.
  it("ignores a choice saved by someone else on this device", () => {
    const raw = serializeHomeFeatured("u1", ["library"]);
    expect(parseHomeFeatured(raw, "u2")).toBeNull();
  });

  it("treats a missing or broken cookie as no choice", () => {
    expect(parseHomeFeatured(undefined, "u1")).toBeNull();
    expect(parseHomeFeatured("%E0%A4%A", "u1")).toBeNull();
    expect(parseHomeFeatured("u1", "u1")).toBeNull();
    expect(parseHomeFeatured(encodeURIComponent("u1|"), "u1")).toBeNull();
  });

  it("drops junk keys and anything past three", () => {
    const raw = encodeURIComponent("u1|chat,<script>,music,union,library");
    expect(parseHomeFeatured(raw, "u1")).toEqual(["chat", "music", "union"]);
  });
});

describe("assignHomeFeaturedSlot", () => {
  it("puts a free service into the slot", () => {
    expect(
      assignHomeFeaturedSlot(["chat", "music", "calls"], 1, "library"),
    ).toEqual(["chat", "library", "calls"]);
  });

  // Иначе выбор в одном месте молча стирал бы другое.
  it("swaps with the slot that already holds the service", () => {
    expect(assignHomeFeaturedSlot(["chat", "music", "calls"], 0, "calls")).toEqual(
      ["calls", "music", "chat"],
    );
  });

  it("changes nothing when the slot already holds the service", () => {
    expect(assignHomeFeaturedSlot(["chat", "music", "calls"], 2, "calls")).toEqual(
      ["chat", "music", "calls"],
    );
  });
});
