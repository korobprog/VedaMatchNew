import { describe, expect, it } from "vitest";
import {
  callReasonLabel,
  callDurationLabel,
  callStatusLabel,
  formatSeconds,
  percentLabel,
} from "./call-labels";

describe("callStatusLabel", () => {
  it("переводит каждый статус звонка на русский", () => {
    expect(callStatusLabel("ringing")).toBe("Дозвон");
    expect(callStatusLabel("accepted")).toBe("Идёт");
    expect(callStatusLabel("ended")).toBe("Состоялся");
    expect(callStatusLabel("missed")).toBe("Пропущен");
    expect(callStatusLabel("declined")).toBe("Отклонён");
    expect(callStatusLabel("cancelled")).toBe("Отменён");
    expect(callStatusLabel("failed")).toBe("Оборвался");
  });
});

describe("formatSeconds", () => {
  it("до часа пишет m:ss, дальше h:mm:ss", () => {
    expect(formatSeconds(0)).toBe("0:00");
    expect(formatSeconds(65)).toBe("1:05");
    expect(formatSeconds(3599)).toBe("59:59");
    expect(formatSeconds(3600)).toBe("1:00:00");
    expect(formatSeconds(3725)).toBe("1:02:05");
  });

  it("отрицательное и дробное не ломают формат", () => {
    expect(formatSeconds(-5)).toBe("0:00");
    expect(formatSeconds(61.9)).toBe("1:01");
    expect(formatSeconds(Number.NaN)).toBe("0:00");
  });
});

describe("callDurationLabel", () => {
  it("считает разговор от ответа до конца", () => {
    expect(
      callDurationLabel("2026-09-01T10:00:00.000Z", "2026-09-01T10:01:05.000Z"),
    ).toBe("1:05");
    expect(
      callDurationLabel("2026-09-01T10:00:00.000Z", "2026-09-01T11:02:05.000Z"),
    ).toBe("1:02:05");
  });

  it("ставит прочерк, когда звонок не отвечен или не закончен", () => {
    expect(callDurationLabel(null, "2026-09-01T10:01:05.000Z")).toBe("—");
    expect(callDurationLabel("2026-09-01T10:00:00.000Z", null)).toBe("—");
    expect(callDurationLabel(undefined, undefined)).toBe("—");
    expect(callDurationLabel("не дата", "2026-09-01T10:01:05.000Z")).toBe("—");
  });
});

describe("percentLabel", () => {
  it("округляет долю до целых процентов", () => {
    expect(percentLabel(0.42)).toBe("42 %");
    expect(percentLabel(0.4249)).toBe("42 %");
    expect(percentLabel(0.425)).toBe("43 %");
    expect(percentLabel(0)).toBe("0 %");
    expect(percentLabel(1)).toBe("100 %");
  });

  it("ставит прочерк, когда доля неизвестна", () => {
    expect(percentLabel(null)).toBe("—");
    expect(percentLabel(undefined)).toBe("—");
  });
});

describe("callReasonLabel", () => {
  it("переводит известные причины и не трогает неизвестные", () => {
    expect(callReasonLabel("hangup")).toBe("Положили трубку");
    expect(callReasonLabel("timeout")).toBe("Не ответили");
    expect(callReasonLabel("network")).toBe("Обрыв сети");
    expect(callReasonLabel("busy")).toBe("Занято");
    expect(callReasonLabel("weird")).toBe("weird");
    expect(callReasonLabel(null)).toBe("—");
  });
});
