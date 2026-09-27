import { describe, expect, it } from "vitest";
import {
  PICTURE_BATCH_MAX,
  addPictures,
  pictureSummary,
  picturesToSend,
  pictureSelectable,
  removePicture,
  setAllPicturesSelected,
  stepPreview,
  togglePictureSelected,
  updatePicture,
  type PictureItem,
} from "./picture-queue";

function file(name: string, type = "image/jpeg", size = 1000): File {
  const blob = new File(["x"], name, { type });
  Object.defineProperty(blob, "size", { value: size });
  return blob;
}

function ids() {
  let n = 0;
  return () => `p${++n}`;
}

describe("addPictures", () => {
  it("queues suitable files as waiting", () => {
    const queue = addPictures([], [file("a.jpg"), file("b.png", "image/png")], ids());
    expect(queue.map((item) => [item.id, item.status])).toEqual([
      ["p1", "waiting"],
      ["p2", "waiting"],
    ]);
  });

  // Неподходящий файл виден в списке с причиной, а не пропадает молча.
  it("keeps an unsuitable file with the reason and never retries it", () => {
    const [gif, huge] = addPictures(
      [],
      [file("a.gif", "image/gif"), file("b.jpg", "image/jpeg", 13 * 1024 * 1024)],
      ids(),
    );
    expect(gif).toMatchObject({
      status: "error",
      message: "Подойдёт JPEG, PNG или WebP",
      retriable: false,
    });
    expect(huge.status).toBe("error");
    expect(huge.message).toMatch(/больше 12 МБ/);
    expect(picturesToSend([gif, huge])).toEqual([]);
  });

  it("stops at the batch limit", () => {
    const many = Array.from({ length: PICTURE_BATCH_MAX + 5 }, (_, i) =>
      file(`${i}.jpg`),
    );
    expect(addPictures([], many, ids())).toHaveLength(PICTURE_BATCH_MAX);
  });
});

describe("picturesToSend", () => {
  it("sends waiting files and retries the ones the server failed", () => {
    const make = ids();
    let queue: PictureItem[] = setAllPicturesSelected(
      addPictures([], [file("a.jpg"), file("b.jpg"), file("c.jpg")], make),
      true,
    );
    queue = updatePicture(queue, "p1", { status: "done", slug: "picture-1" });
    queue = updatePicture(queue, "p2", {
      status: "error",
      message: "Нет связи",
      retriable: true,
    });
    expect(picturesToSend(queue).map((item) => item.id)).toEqual(["p2", "p3"]);
  });
});

describe("removePicture", () => {
  it("drops only the chosen file", () => {
    const queue = addPictures([], [file("a.jpg"), file("b.jpg")], ids());
    expect(removePicture(queue, "p1").map((item) => item.id)).toEqual(["p2"]);
  });
});

describe("pictureSummary", () => {
  it("says nothing before anything was sent", () => {
    expect(pictureSummary(addPictures([], [file("a.jpg")], ids()))).toBeNull();
  });

  it("counts what went out and what did not", () => {
    let queue = setAllPicturesSelected(
      addPictures([], [file("a.jpg"), file("b.jpg"), file("c.jpg")], ids()),
      true,
    );
    queue = updatePicture(queue, "p1", { status: "done" });
    queue = updatePicture(queue, "p2", { status: "done" });
    expect(pictureSummary(queue)).toBe("Опубликовано 2 из 3");
    queue = updatePicture(queue, "p3", { status: "error" });
    expect(pictureSummary(queue)).toBe("Опубликовано 2 из 3, не загрузилось: 1");
  });
});

// VED-302: картинку сначала смотрят, а берут рамочкой в углу.
describe("выбор картинок", () => {
  it("добавленный файл ещё не выбран и не уходит по кнопке", () => {
    const queue = addPictures([], [file("a.jpg"), file("b.jpg")], ids());
    expect(queue.every((item) => !item.selected)).toBe(true);
    expect(picturesToSend(queue)).toEqual([]);
  });

  it("рамочка отмечает и снимает отметку, несколько сразу", () => {
    let queue = addPictures([], [file("a.jpg"), file("b.jpg"), file("c.jpg")], ids());
    queue = togglePictureSelected(queue, "p1");
    queue = togglePictureSelected(queue, "p3");
    expect(picturesToSend(queue).map((item) => item.id)).toEqual(["p1", "p3"]);
    queue = togglePictureSelected(queue, "p1");
    expect(picturesToSend(queue).map((item) => item.id)).toEqual(["p3"]);
  });

  it("отвергнутый на входе файл не отмечается", () => {
    let queue = addPictures([], [file("a.gif", "image/gif")], ids());
    expect(pictureSelectable(queue[0])).toBe(false);
    queue = togglePictureSelected(queue, "p1");
    queue = setAllPicturesSelected(queue, true);
    expect(queue[0].selected).toBe(false);
  });

  it("итог не считает неотмеченные", () => {
    let queue = addPictures([], [file("a.jpg"), file("b.jpg")], ids());
    queue = togglePictureSelected(queue, "p1");
    queue = updatePicture(queue, "p1", { status: "done" });
    expect(pictureSummary(queue)).toBe("Опубликовано 1 из 1");
  });
});

describe("stepPreview", () => {
  it("листает по кругу", () => {
    expect(stepPreview(0, 1, 3)).toBe(1);
    expect(stepPreview(2, 1, 3)).toBe(0);
    expect(stepPreview(0, -1, 3)).toBe(2);
    expect(stepPreview(0, 1, 0)).toBe(0);
  });
});
