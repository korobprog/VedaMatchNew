import { describe, expect, it } from "vitest";
import { ApiError, NetworkError } from "@/lib/http-client";
import {
  READER_LOAD_TEXT,
  ReaderLoadError,
  readerLoadFailure,
  readerLoadRetriable,
} from "./reader-load";

describe("readerLoadFailure", () => {
  it("обрыв сети — «нет на устройстве»", () => {
    expect(readerLoadFailure(new NetworkError())).toBe("offline");
    expect(readerLoadFailure(new TypeError("Failed to fetch"))).toBe("offline");
  });

  it("404 — книга или глава недоступна, в том числе снятая с полки", () => {
    expect(readerLoadFailure(new ApiError("book_not_found", 404))).toBe(
      "unavailable",
    );
  });

  it("прочие ответы портала и неразборчивое тело — сбой загрузки", () => {
    expect(readerLoadFailure(new ApiError("boom", 500))).toBe("failed");
    expect(readerLoadFailure(new ApiError("forbidden", 403))).toBe("failed");
    expect(readerLoadFailure(new SyntaxError("Unexpected token"))).toBe(
      "failed",
    );
    expect(readerLoadFailure("строка вместо ошибки")).toBe("failed");
  });
});

describe("readerLoadRetriable", () => {
  it("не предлагает повторять, когда книги нет", () => {
    expect(readerLoadRetriable("unavailable")).toBe(false);
    expect(readerLoadRetriable("offline")).toBe(true);
    expect(readerLoadRetriable("failed")).toBe(true);
  });
});

describe("ReaderLoadError", () => {
  it("несёт причину и текст для человека, а не строку движка", () => {
    const cause = new ApiError("book_not_found", 404);
    const error = new ReaderLoadError(cause);
    expect(error.failure).toBe("unavailable");
    expect(error.message).toBe(READER_LOAD_TEXT.unavailable);
    expect(error.cause).toBe(cause);
  });
});
