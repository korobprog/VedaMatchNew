import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  BookUploadError,
  deleteBookFile,
  uploadBookFile,
} from "./book-file-upload";

/* VED-662: заливка файла книги — завершение переспрашивается, файл не льётся заново. */

const UPLOAD = {
  key: "vedabase/books/book-1/0f8fad5b-d9cb-469f-a165-70867728950e.pdf",
  url: "https://s3.example/put",
  headers: { "Content-Type": "application/pdf" },
  expiresInSeconds: 3600,
};
const SAVED = { id: "file-1", name: "Гита.pdf", format: "pdf", sizeBytes: 4 };

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

/** Заливка в бакет: сколько раз и чем закончилась. */
let puts: Array<{ url: string; timeout: number }>;
let putOutcome: "load" | "abort" | "timeout";

class FakeXhr {
  status = 200;
  timeout = 0;
  upload: { onprogress?: (event: unknown) => void } = {};
  onload?: () => void;
  onerror?: () => void;
  onabort?: () => void;
  ontimeout?: () => void;
  private url = "";
  open(_method: string, url: string) {
    this.url = url;
  }
  setRequestHeader() {}
  send() {
    puts.push({ url: this.url, timeout: this.timeout });
    queueMicrotask(() => {
      if (putOutcome === "load") this.onload?.();
      else if (putOutcome === "abort") this.onabort?.();
      else this.ontimeout?.();
    });
  }
}

const file = new File(["%PDF"], "Гита.pdf", { type: "application/pdf" });

function stubApi(completions: Response[]) {
  const fetchMock = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      void init;
      const url = String(input);
      if (url.endsWith("/files/upload")) return json(200, UPLOAD);
      const next = completions.shift();
      if (!next) throw new Error("unexpected completion call");
      return next;
    },
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const completionCalls = (fetchMock: ReturnType<typeof stubApi>) =>
  fetchMock.mock.calls.filter(([input]) => String(input).endsWith("/files"));

describe("uploadBookFile", () => {
  beforeEach(() => {
    puts = [];
    putOutcome = "load";
    vi.useFakeTimers();
    vi.stubGlobal("XMLHttpRequest", FakeXhr);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("при сбое сервера переспрашивает завершение, а файл льёт один раз", async () => {
    const fetchMock = stubApi([
      json(503, { message: "book_storage_unavailable" }),
      json(200, SAVED),
    ]);

    const saving = uploadBookFile("gita", file);
    await vi.runAllTimersAsync();

    await expect(saving).resolves.toEqual(SAVED);
    expect(puts).toHaveLength(1);
    expect(completionCalls(fetchMock)).toHaveLength(2);
    // Оба раза — с одним ключом: сервер узнаёт повтор по нему.
    for (const [, init] of completionCalls(fetchMock)) {
      expect(JSON.parse(String(init?.body))).toMatchObject({
        key: UPLOAD.key,
      });
    }
  });

  it("отказ по существу не повторяет", async () => {
    const fetchMock = stubApi([
      json(400, { message: "book_file_content_mismatch" }),
    ]);

    const saving = uploadBookFile("gita", file);
    const failure = expect(saving).rejects.toMatchObject({
      code: "book_file_content_mismatch",
    });
    await vi.runAllTimersAsync();

    await failure;
    expect(completionCalls(fetchMock)).toHaveLength(1);
  });

  it("после трёх неудач сдаётся с причиной", async () => {
    const fetchMock = stubApi([
      json(502, {}),
      json(502, {}),
      json(502, {}),
    ]);

    const saving = uploadBookFile("gita", file);
    const failure = expect(saving).rejects.toBeInstanceOf(BookUploadError);
    await vi.runAllTimersAsync();

    await failure;
    expect(completionCalls(fetchMock)).toHaveLength(3);
    expect(puts).toHaveLength(1);
  });

  it.each(["abort", "timeout"] as const)(
    "оборванная заливка (%s) завершается отказом, а не висит",
    async (outcome) => {
      putOutcome = outcome;
      const fetchMock = stubApi([]);

      const saving = uploadBookFile("gita", file);
      const failure = expect(saving).rejects.toMatchObject({ code: "network" });
      await vi.runAllTimersAsync();

      await failure;
      expect(completionCalls(fetchMock)).toHaveLength(0);
    },
  );

  it("ставит заливке предел по сроку жизни ссылки", async () => {
    stubApi([json(200, SAVED)]);

    const saving = uploadBookFile("gita", file);
    await vi.runAllTimersAsync();
    await saving;

    expect(puts[0]).toEqual({ url: UPLOAD.url, timeout: 3_600_000 });
  });
});

describe("deleteBookFile", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("уже убранный файл отказом не считает", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => json(404, { message: "book_file_not_found" })),
    );

    await expect(deleteBookFile("gita", "file-1")).resolves.toBeUndefined();
  });

  it("настоящий отказ пробрасывает", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => json(403, { message: "Forbidden" })),
    );

    await expect(deleteBookFile("gita", "file-1")).rejects.toMatchObject({
      code: "Forbidden",
    });
  });
});
