import { describe, expect, it } from "vitest";
import {
  collectionEmptyText,
  collectionImageSource,
  collectionViewHref,
  isStoryView,
  parseCollectionView,
} from "./folder-view";

describe("parseCollectionView", () => {
  it("без параметра папка открывается иллюстрациями", () => {
    expect(parseCollectionView(undefined)).toBe("image");
    expect(parseCollectionView("")).toBe("image");
    expect(parseCollectionView("что-то своё")).toBe("image");
  });

  it("различает фотографии и работу нейросети", () => {
    expect(parseCollectionView("photo")).toBe("photo");
    expect(parseCollectionView("ai")).toBe("ai");
  });

  it("старая ссылка ?view=story ведёт к афоризмам на фотографиях", () => {
    // Ради них вид и заводили: под «готовым афоризмом» имелся в виду тот,
    // что человек наложил на фотографию.
    expect(parseCollectionView("story")).toBe("photo");
  });

  it("повторённый параметр берёт первое значение", () => {
    expect(parseCollectionView(["ai", "photo"])).toBe("ai");
  });
});

describe("collectionViewHref", () => {
  it("первый вид — чистый адрес папки", () => {
    expect(collectionViewHref("vedy", "image")).toBe(
      "/motivation/collections/vedy",
    );
  });

  it("остальные виды уезжают в адрес", () => {
    expect(collectionViewHref("vedy", "photo")).toBe(
      "/motivation/collections/vedy?view=photo",
    );
    expect(collectionViewHref("vedy", "ai")).toBe(
      "/motivation/collections/vedy?view=ai",
    );
  });

  it("слаг с необычными знаками не ломает ссылку", () => {
    expect(collectionViewHref("шри вьяса", "photo")).toBe(
      `/motivation/collections/${encodeURIComponent("шри вьяса")}?view=photo`,
    );
  });
});

describe("collectionImageSource", () => {
  it("фильтр выдачи соответствует виду", () => {
    expect(collectionImageSource("photo")).toBe("uploaded");
    expect(collectionImageSource("ai")).toBe("generated");
  });

  it("иллюстрации показываем у всех подряд", () => {
    expect(collectionImageSource("image")).toBeUndefined();
  });
});

describe("isStoryView", () => {
  it("оформленный афоризм — оба вида, кроме иллюстраций", () => {
    expect(isStoryView("photo")).toBe(true);
    expect(isStoryView("ai")).toBe(true);
    expect(isStoryView("image")).toBe(false);
  });
});

describe("collectionEmptyText", () => {
  it("пустой вид объясняет себя, а не папку", () => {
    // В папке может быть полсотни афоризмов — просто ни одного этого вида.
    expect(collectionEmptyText("photo")).toContain("на фотографии");
    expect(collectionEmptyText("ai")).toContain("нейросет");
    expect(collectionEmptyText("image")).toBe("В этом разделе пока пусто.");
  });
});
