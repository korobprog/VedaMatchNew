import { describe, expect, it } from "vitest";
import {
  addShlokaHref,
  folderKeyFromQuery,
  folderTitle,
  shlokaFolderHref,
} from "./shloka-folders";

describe("shlokaFolderHref", () => {
  it("папка — та же страница рубрики с ключом в адресе", () => {
    expect(shlokaFolderHref("shloki", "бхагавад-гита")).toBe(
      "/library/shloki?source=%D0%B1%D1%85%D0%B0%D0%B3%D0%B0%D0%B2%D0%B0%D0%B4-%D0%B3%D0%B8%D1%82%D0%B0",
    );
    expect(shlokaFolderHref("shloki", "a/b & c")).toBe(
      "/library/shloki?source=a%2Fb%20%26%20c",
    );
  });
});

describe("folderKeyFromQuery", () => {
  it("берёт непустую строку и отбрасывает остальное", () => {
    expect(folderKeyFromQuery(" _ ")).toBe("_");
    expect(folderKeyFromQuery("")).toBeNull();
    expect(folderKeyFromQuery(undefined)).toBeNull();
    expect(folderKeyFromQuery(["a", "b"])).toBeNull();
  });
});

describe("folderTitle", () => {
  it("папка без источника подписана словами", () => {
    expect(folderTitle("ru", { label: null })).toBe("Без источника");
    expect(folderTitle("en", { label: null })).toBe("No source");
    expect(folderTitle("ru", { label: "Бхагавад-гита" })).toBe("Бхагавад-гита");
  });
});

describe("addShlokaHref", () => {
  it("из папки — с источником, из списка папок и «Без источника» — без", () => {
    expect(addShlokaHref("shloki", "Бхагавад-гита")).toBe(
      `/library/add/shloka?category=shloki&source=${encodeURIComponent("Бхагавад-гита").replace(/%20/g, "+")}`,
    );
    expect(addShlokaHref("shloki")).toBe("/library/add/shloka?category=shloki");
    expect(addShlokaHref("shloki", null)).toBe(
      "/library/add/shloka?category=shloki",
    );
  });
});
