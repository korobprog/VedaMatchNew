import { describe, expect, it, vi } from "vitest";
import { apiFetch } from "@/lib/http-client";
import { WorkApiError, attachWorkFile } from "./work-api";

vi.mock("@/lib/http-client", () => ({
  apiFetch: vi.fn(),
}));

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

describe("work-api: обрыв связи (VED-608)", () => {
  it("fetch без ответа превращается в ошибку со статусом 0 — очередь повторит", async () => {
    vi.mocked(apiFetch).mockRejectedValueOnce(
      new TypeError("Failed to fetch"),
    );
    const failure = attachWorkFile("t1", new File(["x"], "s.png")).then(
      () => null,
      (cause: unknown) => cause,
    );
    const cause = await failure;
    expect(cause).toBeInstanceOf(WorkApiError);
    // Статус 0 — метка обрыва: по ней upload-queue переотправляет файл.
    expect((cause as WorkApiError).status).toBe(0);
  });

  it("отказ сервера остаётся отказом со своим статусом и текстом", async () => {
    vi.mocked(apiFetch).mockResolvedValueOnce(
      json({ message: "Файл слишком большой" }, 413),
    );
    const cause = await attachWorkFile("t1", new File(["x"], "s.png")).then(
      () => null,
      (e: unknown) => e,
    );
    expect(cause).toBeInstanceOf(WorkApiError);
    expect(cause).toMatchObject({
      status: 413,
      message: "Файл слишком большой",
    });
  });
});
