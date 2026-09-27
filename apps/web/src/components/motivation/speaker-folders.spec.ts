import { describe, expect, it } from "vitest";
import { groupSpeakersByFolder } from "./speaker-folders";

const options = [
  { label: "Ш. Б. Свами Прабхупада", count: 4, folder: "vedas" as const },
  { label: "Конфуций", count: 2, folder: "world_wisdom" as const },
  { label: "Лао-Цзы", count: 1, folder: "world_wisdom" as const },
  { label: "Наполеон Бонапарт", count: 1, folder: null },
  { label: "Гектор Берлиоз", count: 1 },
];

describe("папки авторов в фильтре ленты (VED-584)", () => {
  it("папки — в порядке заказчика, авторы без папки — отдельно", () => {
    const { folders, loose } = groupSpeakersByFolder(options);
    expect(folders.map((folder) => [folder.label, folder.count])).toEqual([
      ["Мудрость мира", 3],
      ["Веды", 4],
    ]);
    expect(folders[0].options.map((option) => option.label)).toEqual([
      "Конфуций",
      "Лао-Цзы",
    ]);
    expect(loose.map((option) => option.label)).toEqual([
      "Наполеон Бонапарт",
      "Гектор Берлиоз",
    ]);
  });

  it("пустая папка не показывается", () => {
    const { folders } = groupSpeakersByFolder(options.slice(3));
    expect(folders).toEqual([]);
  });

  it("папка с выбранным автором помечена — её показывают раскрытой", () => {
    const { folders } = groupSpeakersByFolder(options, "конфуций");
    expect(folders.map((folder) => folder.containsCurrent)).toEqual([
      true,
      false,
    ]);
  });

  it("свежая правка администратора важнее ответа сервера", () => {
    const { folders, loose } = groupSpeakersByFolder(options, undefined, {
      Конфуций: null,
      "Наполеон Бонапарт": "world_wisdom",
    });
    expect(folders[0].options.map((option) => option.label)).toEqual([
      "Лао-Цзы",
      "Наполеон Бонапарт",
    ]);
    expect(loose.map((option) => option.label)).toEqual([
      "Конфуций",
      "Гектор Берлиоз",
    ]);
  });
});
