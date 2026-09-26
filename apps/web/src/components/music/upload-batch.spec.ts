import { describe, expect, it } from "vitest";
import {
  isQuotaRejection,
  planUploadBatch,
  quotaSummary,
} from "./upload-batch";

const MB = 1024 * 1024;
const usage = (usedBytes: number, quotaBytes = 1000 * MB) => ({
  usedBytes,
  quotaBytes,
});

describe("planUploadBatch", () => {
  it("всё помещается", () => {
    expect(planUploadBatch([100 * MB, 200 * MB], usage(0))).toEqual({
      fits: 2,
      freeBytes: 1000 * MB,
      overflowBytes: 0,
    });
  });

  it("помещается начало списка, первый не влезший останавливает остальных", () => {
    const plan = planUploadBatch(
      [300 * MB, 300 * MB, 300 * MB, 10 * MB],
      usage(200 * MB),
    );
    expect(plan.fits).toBe(2);
    expect(plan.freeBytes).toBe(800 * MB);
    expect(plan.overflowBytes).toBe(310 * MB);
  });

  it("квота уже превышена — ни одного", () => {
    expect(planUploadBatch([MB], usage(1200 * MB)).fits).toBe(0);
  });

  it("без ограничения или без сведений — решает сервер", () => {
    expect(
      planUploadBatch([5000 * MB], { ...usage(0), unlimited: true }).fits,
    ).toBe(1);
    expect(planUploadBatch([5000 * MB], null)).toEqual({
      fits: 1,
      freeBytes: null,
      overflowBytes: 0,
    });
  });
});

describe("quota messages", () => {
  it("узнаёт отказ сервера по квоте", () => {
    expect(
      isQuotaRejection(
        "Закончилось место. Удалите старые загрузки или напишите в поддержку.",
      ),
    ).toBe(true);
    expect(isQuotaRejection("Файл слишком большой.")).toBe(false);
  });

  it("одна строка с цифрами", () => {
    const fmt = (bytes: number) => `${Math.round(bytes / MB)} МБ`;
    expect(quotaSummary(8, 10, 50 * MB, fmt)).toMatch(
      /^Не поместилось 8 из 10: .* Свободно 50 МБ\./,
    );
    expect(quotaSummary(3, 3, 0, fmt)).toMatch(/^Ни один файл не поместился/);
  });
});
