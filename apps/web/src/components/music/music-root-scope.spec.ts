import { describe, expect, it } from "vitest";
import type { MusicArtistDto, MusicCategoryDto } from "@vedamatch/shared";
import {
  artistsInRoot,
  findRootCategory,
  styleFilterCategories,
} from "./music-root-scope";

function category(patch: Partial<MusicCategoryDto>): MusicCategoryDto {
  return {
    id: "cat",
    slug: "cat",
    title: "Категория",
    position: 0,
    kind: "style",
    trackCount: 0,
    ...patch,
  };
}

function artist(patch: Partial<MusicArtistDto>): MusicArtistDto {
  return {
    id: "artist",
    slug: "artist",
    name: "Исполнитель",
    kind: "kirtaneer",
    bio: null,
    coverUrl: null,
    isVerified: false,
    trackCount: 0,
    rootCategoryId: null,
    isAudiobook: false,
    ...patch,
  };
}

const traditional = category({
  id: "root-trad",
  slug: "traditional",
  title: "Традиционное",
  kind: "root",
  trackCount: 88,
});
const modern = category({
  id: "root-modern",
  slug: "modern",
  title: "Современное",
  kind: "root",
  trackCount: 92,
});
const kirtan = category({
  id: "style-kirtan",
  slug: "kirtan",
  title: "Киртан",
  trackCount: 12,
});

describe("findRootCategory", () => {
  it("находит корневую по слагу из адреса", () => {
    expect(findRootCategory([traditional, modern, kirtan], "modern")).toBe(
      modern,
    );
  });

  it("без слага — вкладка «Всё», среза нет", () => {
    expect(findRootCategory([traditional, modern], null)).toBeNull();
  });

  it("стиль с тем же слагом за корневую не принимает", () => {
    const styleTwin = category({ id: "style-twin", slug: "modern" });

    expect(findRootCategory([styleTwin], "modern")).toBeNull();
  });
});

describe("artistsInRoot", () => {
  const jiv = artist({ id: "a1", slug: "jiv", rootCategoryId: "root-modern" });
  const sudevi = artist({
    id: "a2",
    slug: "sudevi",
    rootCategoryId: "root-trad",
  });
  const unmarked = artist({ id: "a3", slug: "mantry" });
  const all = [jiv, sudevi, unmarked];

  it("оставляет только исполнителей выбранной корневой", () => {
    expect(artistsInRoot(all, "root-trad")).toEqual([sudevi]);
  });

  it("исполнителей другой корневой убирает с экрана (VED-165)", () => {
    expect(artistsInRoot(all, "root-modern")).not.toContain(sudevi);
  });

  it("неразмеченный исполнитель не попадает ни в одну вкладку", () => {
    expect(artistsInRoot(all, "root-trad")).not.toContain(unmarked);
    expect(artistsInRoot(all, "root-modern")).not.toContain(unmarked);
  });

  it("на вкладке «Всё» отдаёт список как есть", () => {
    expect(artistsInRoot(all, null)).toEqual(all);
  });

  it("исходный список не трогает", () => {
    artistsInRoot(all, "root-trad");

    expect(all).toHaveLength(3);
  });
});

describe("styleFilterCategories", () => {
  it("корневые в панель фильтров не пускает", () => {
    expect(styleFilterCategories([traditional, modern, kirtan])).toEqual([
      kirtan,
    ]);
  });

  it("отбрасывает и стиль-тёзку корневой — остаток ручной разметки на проде", () => {
    const leftover = category({
      id: "style-trad",
      slug: "tradicionnoe",
      title: "Традиционное",
    });

    expect(styleFilterCategories([traditional, leftover, kirtan])).toEqual([
      kirtan,
    ]);
  });

  it("тёзку узнаёт независимо от регистра и пробелов", () => {
    const leftover = category({
      id: "style-modern",
      slug: "sovremennoe",
      title: "  современное ",
    });

    expect(styleFilterCategories([modern, leftover])).toEqual([]);
  });

  it("настоящий стиль с непохожим названием оставляет", () => {
    const bhajan = category({ id: "style-bhajan", slug: "bhajan", title: "Бхаджан" });

    expect(styleFilterCategories([traditional, modern, kirtan, bhajan])).toEqual(
      [kirtan, bhajan],
    );
  });

  it("без корневых отдаёт все стили", () => {
    expect(styleFilterCategories([kirtan])).toEqual([kirtan]);
  });
});
