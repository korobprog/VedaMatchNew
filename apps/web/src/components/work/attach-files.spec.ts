import { describe, expect, it, vi } from "vitest";
import {
  MAX_FILES_AT_ONCE,
  uploadInTurn,
  uploadProblemMessage,
} from "./attach-files";

function png(name: string) {
  return new File(["x"], name, { type: "image/png" });
}

describe("uploadInTurn", () => {
  it("отправляет подготовленный файл, а не исходный (VED-582)", async () => {
    const sent: string[] = [];
    await uploadInTurn(
      [png("a.png"), png("b.png")],
      async (file) => {
        sent.push(file.name);
      },
      undefined,
      async (file) => new File(["y"], file.name.replace(".png", ".webp")),
    );
    expect(sent).toEqual(["a.webp", "b.webp"]);
  });

  it("готовит следующий файл, пока уходит текущий, и держит порядок", async () => {
    const events: string[] = [];
    let release: () => void = () => {};
    const firstUpload = new Promise<void>((resolve) => (release = resolve));
    const done = uploadInTurn(
      [png("1.png"), png("2.png"), png("3.png")],
      async (file) => {
        events.push(`upload ${file.name}`);
        if (file.name === "1.png") await firstUpload;
      },
      undefined,
      async (file) => {
        events.push(`prepare ${file.name}`);
        return file;
      },
    );
    await vi.waitFor(() => expect(events).toContain("prepare 2.png"));
    // Второй файл готов, но не ушёл: отправка по одному.
    expect(events).not.toContain("upload 2.png");
    release();
    await done;
    expect(events.filter((e) => e.startsWith("upload"))).toEqual([
      "upload 1.png",
      "upload 2.png",
      "upload 3.png",
    ]);
  });

  it("сбой подготовки — уходит исходный файл", async () => {
    const sent: string[] = [];
    const result = await uploadInTurn(
      [png("a.png")],
      async (file) => {
        sent.push(file.name);
        return "ok";
      },
      undefined,
      async () => {
        throw new Error("canvas");
      },
    );
    expect(sent).toEqual(["a.png"]);
    expect(result.failed).toEqual([]);
  });

  it("грузит файлы по одному и в порядке выбора", async () => {
    const order: string[] = [];
    let inFlight = 0;
    const upload = vi.fn(async (file: File) => {
      inFlight += 1;
      // Два запроса разом — значит, очередь не держится.
      expect(inFlight).toBe(1);
      order.push(file.name);
      await Promise.resolve();
      inFlight -= 1;
      return order.length;
    });

    const result = await uploadInTurn(
      [png("1.png"), png("2.png"), png("3.png")],
      upload,
    );

    expect(order).toEqual(["1.png", "2.png", "3.png"]);
    expect(result).toEqual({ last: 3, failed: [], skipped: 0 });
  });

  it("сбой одного файла не останавливает остальные", async () => {
    const upload = vi.fn(async (file: File) => {
      if (file.name === "big.png") throw new Error("Файл больше 10 МБ");
      return file.name;
    });

    const result = await uploadInTurn(
      [png("a.png"), png("big.png"), png("c.png")],
      upload,
    );

    expect(upload).toHaveBeenCalledTimes(3);
    expect(result.last).toBe("c.png");
    expect(result.failed).toEqual([
      { name: "big.png", reason: "Файл больше 10 МБ" },
    ]);
  });

  it("берёт не больше лимита за раз, лишние считает", async () => {
    const files = Array.from({ length: MAX_FILES_AT_ONCE + 3 }, (_, i) =>
      png(`${i}.png`),
    );
    const upload = vi.fn(async () => "ok");

    const result = await uploadInTurn(files, upload);

    expect(upload).toHaveBeenCalledTimes(MAX_FILES_AT_ONCE);
    expect(result.skipped).toBe(3);
  });

  it("сообщает, сколько ушло из скольких", async () => {
    const progress: Array<[number, number]> = [];

    await uploadInTurn(
      [png("1.png"), png("2.png")],
      async () => "ok",
      (done, total) => progress.push([done, total]),
    );

    expect(progress).toEqual([
      [0, 2],
      [1, 2],
      [2, 2],
    ]);
  });
});

describe("uploadProblemMessage", () => {
  it("всё приложилось — сказать нечего", () => {
    expect(uploadProblemMessage({ failed: [], skipped: 0 })).toBeNull();
  });

  it("называет файл, который не приложился, и причину", () => {
    expect(
      uploadProblemMessage({
        failed: [{ name: "big.png", reason: "Файл больше 10 МБ" }],
        skipped: 0,
      }),
    ).toBe("«big.png» не приложился: Файл больше 10 МБ");
  });

  it("говорит, что лишние файлы не взяты", () => {
    expect(uploadProblemMessage({ failed: [], skipped: 2 })).toBe(
      `за раз прикрепляется не больше ${MAX_FILES_AT_ONCE} файлов — ещё 2 выберите следующим заходом`,
    );
  });
});
