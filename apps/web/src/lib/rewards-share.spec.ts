import { describe, expect, it } from "vitest";
import { REWARDS_LEDGER_TYPES } from "@vedamatch/shared";
import {
  LEDGER_TYPE_LABELS,
  REFERRAL_STATUS_LABELS,
  REWARDS_SHARE_TEXT,
  balanceNote,
  formatLedgerAmount,
  shareLink,
} from "./rewards-share";

const LINK = "https://vedamatch.ru/?ref=ACDEFGH";

describe("shareLink", () => {
  it("кодирует ссылку и текст для Telegram", () => {
    const url = new URL(shareLink("telegram", LINK));
    expect(url.origin + url.pathname).toBe("https://t.me/share/url");
    expect(url.searchParams.get("url")).toBe(LINK);
    expect(url.searchParams.get("text")).toBe(REWARDS_SHARE_TEXT);
  });

  // WhatsApp принимает одну строку: ссылка обязана оказаться в конце, иначе
  // предпросмотр цепляется за текст, а не за приглашение.
  it("склеивает текст и ссылку одной строкой для WhatsApp", () => {
    const url = new URL(shareLink("whatsapp", LINK));
    expect(url.origin + url.pathname).toBe("https://wa.me/");
    expect(url.searchParams.get("text")).toBe(`${REWARDS_SHARE_TEXT} ${LINK}`);
  });

  it("не ломается на тексте со спецсимволами", () => {
    const url = new URL(shareLink("telegram", LINK, "Заходи — тут & интересно"));
    expect(url.searchParams.get("text")).toBe("Заходи — тут & интересно");
  });
});

describe("formatLedgerAmount", () => {
  it("проставляет плюс явно, чтобы знак не терялся при беглом чтении", () => {
    expect(formatLedgerAmount(30)).toBe("+30");
    expect(formatLedgerAmount(-30)).toBe("-30");
    expect(formatLedgerAmount(0)).toBe("0");
  });
});

describe("balanceNote", () => {
  it("в бете обещает сохранность, а не трату", () => {
    expect(balanceNote(false)).toContain("после завершения беты");
    expect(balanceNote(false)).toContain("сохранятся");
  });

  it("в business говорит про абонемент", () => {
    expect(balanceNote(true)).toContain("абонемента");
  });
});

describe("подписи", () => {
  // Сверяемся со списком из @vedamatch/shared: новый тип операции обязан
  // получить подпись, иначе в истории появится пустая строка.
  it("покрывают все типы операций", () => {
    expect(Object.keys(LEDGER_TYPE_LABELS).sort()).toEqual(
      [...REWARDS_LEDGER_TYPES].sort(),
    );
  });

  it("называют три состояния приглашённого и отказ", () => {
    expect(REFERRAL_STATUS_LABELS.registered).toBe("Зарегистрирован");
    expect(REFERRAL_STATUS_LABELS.qualified).toBe("Выполнил условие");
    expect(REFERRAL_STATUS_LABELS.awarded).toBe("Начислено");
    expect(REFERRAL_STATUS_LABELS.rejected).toBe("Не засчитан");
  });
});
