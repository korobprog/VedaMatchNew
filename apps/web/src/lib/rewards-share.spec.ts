import { describe, expect, it } from "vitest";
import { REWARDS_LEDGER_TYPES } from "@vedamatch/shared";
import {
  LEDGER_TYPE_LABELS,
  REFERRAL_STATUS_LABELS,
  REWARDS_SHARE_TEXT,
  balanceNote,
  buildInviteMessage,
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

describe("buildInviteMessage", () => {
  const services = [
    { name: "Знакомства", tagline: "Совместимость — это не вайб, а расчёт" },
    { name: "Астрология", tagline: "Ведическая карта рождения" },
  ];

  function build(patch: Partial<Parameters<typeof buildInviteMessage>[0]> = {}) {
    return buildInviteMessage({ link: LINK, services, welcomePoints: 10, ...patch });
  }

  it("перечисляет сервисы и заканчивается ссылкой", () => {
    const lines = build().split("\n");
    expect(lines).toContain("• Знакомства: совместимость — это не вайб, а расчёт");
    expect(lines).toContain("• Астрология: ведическая карта рождения");
    // Ссылка последней строкой: превью в мессенджере цепляется за неё.
    expect(lines[lines.length - 1]).toBe(LINK);
  });

  it("называет сумму из настроек и склоняет её", () => {
    expect(build()).toContain("сразу 10 баллов на счёт");
    expect(build({ welcomePoints: 1 })).toContain("сразу 1 балл на счёт");
    expect(build({ welcomePoints: 22 })).toContain("сразу 22 балла на счёт");
  });

  // Обнулили приветственные баллы в админке — приглашение не должно обещать
  // «сразу 0 баллов».
  it("молчит про баллы, когда номинал обнулён", () => {
    const text = build({ welcomePoints: 0 });
    expect(text).not.toContain("балл");
    expect(text).toContain("Моя ссылка для регистрации:");
  });

  it("не ломается на пустом каталоге", () => {
    const text = build({ services: [] });
    expect(text).toContain("VedaMatch");
    expect(text.trim().endsWith(LINK)).toBe(true);
  });

  it("не сбивает регистр у названий и аббревиатур", () => {
    const text = build({
      services: [{ name: "Рынок", tagline: "AI-подбор товаров" }],
    });
    expect(text).toContain("• Рынок: AI-подбор товаров");
  });

  // Иначе получается «Общение: переписка портала: диалоги…» — список внутри
  // списка, и глаз спотыкается на каждой такой строке.
  it("не ставит второе двоеточие, когда оно уже есть в описании", () => {
    const text = build({
      services: [
        { name: "Общение", tagline: "Переписка портала: диалоги и группы" },
      ],
    });
    expect(text).toContain("• Общение — переписка портала: диалоги и группы");
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
