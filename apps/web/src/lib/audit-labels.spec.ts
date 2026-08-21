import { describe, expect, it } from "vitest";
import {
  auditActionLabels,
  auditTargetHref,
  describeAuditDetails,
} from "./audit-labels";

describe("auditActionLabels", () => {
  it("покрывает действия, которые пишет бэкенд", () => {
    expect(auditActionLabels["user.purged"]).toBe(
      "Аккаунт удалён безвозвратно",
    );
    expect(Object.keys(auditActionLabels)).toHaveLength(34);
  });
});

describe("describeAuditDetails", () => {
  it("подписывает известные ключи", () => {
    expect(describeAuditDetails({ from: "user", to: "admin" })).toBe(
      "было: user · стало: admin",
    );
  });

  it("переводит логические значения на русский", () => {
    expect(describeAuditDetails({ important: true, hidden: false })).toBe(
      "важное: да · скрыт: нет",
    );
  });

  it("выбрасывает пустые значения", () => {
    expect(describeAuditDetails({ reason: null, note: "", to: "yogi" })).toBe(
      "стало: yogi",
    );
  });

  it("показывает дату по-человечески, а не ISO-меткой", () => {
    expect(
      describeAuditDetails({ paidUntil: "2026-09-21T02:14:15.967Z" }),
    ).toMatch(/^оплачено до: 21\.09\.2026/);
  });

  it("строку, похожую на дату лишь началом, не трогает", () => {
    expect(describeAuditDetails({ note: "2026-09-21 плата" })).toBe(
      "заметка: 2026-09-21 плата",
    );
  });

  it("пустые подробности дают пустую строку", () => {
    expect(describeAuditDetails({})).toBe("");
  });
});

describe("auditTargetHref", () => {
  it("ведёт в карточку пользователя", () => {
    expect(auditTargetHref("user", "u-1")).toBe("/admin/users/u-1");
  });

  it("ведёт в раздел рассылок", () => {
    expect(auditTargetHref("broadcast", "b-1")).toBe("/admin/notifications");
  });

  it("не выдумывает ссылку туда, где экрана нет", () => {
    expect(auditTargetHref("listing", "l-1")).toBeNull();
    expect(auditTargetHref("platform", null)).toBeNull();
    expect(auditTargetHref("user", null)).toBeNull();
  });
});
