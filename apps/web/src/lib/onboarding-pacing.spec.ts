import { describe, expect, it } from "vitest";
import {
  accountAgeDays,
  advisorLimitFor,
  showsInstallPrompts,
  showsInviteTeaser,
} from "./onboarding-pacing";

const now = new Date("2026-09-01T12:00:00.000Z");
const daysAgo = (days: number) =>
  new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();

describe("accountAgeDays", () => {
  it("считает целыми сутками", () => {
    expect(accountAgeDays(daysAgo(0), now)).toBe(0);
    expect(accountAgeDays(daysAgo(0.9), now)).toBe(0);
    expect(accountAgeDays(daysAgo(3.2), now)).toBe(3);
  });

  // Дата из будущего — рассинхрон часов, а не отрицательный возраст.
  it("не уходит в минус", () => {
    expect(accountAgeDays(daysAgo(-5), now)).toBe(0);
  });

  // Лучше показать всё, чем молча спрятать подсказки у всех, у кого поле
  // не пришло.
  it("без даты считает аккаунт взрослым", () => {
    expect(accountAgeDays(null, now)).toBe(Number.POSITIVE_INFINITY);
    expect(accountAgeDays("не дата", now)).toBe(Number.POSITIVE_INFINITY);
  });
});

/**
 * Раньше новичок получал всё сразу: три карточки, приглашение, баннер и
 * просьбу об уведомлениях в одну секунду. Тест сторожит именно порядок
 * появления.
 */
describe("темп подсказок", () => {
  it("в первый день — одна карточка советника и ничего больше", () => {
    expect(advisorLimitFor(daysAgo(0), now)).toBe(1);
    expect(showsInviteTeaser(daysAgo(0), now)).toBe(false);
    expect(showsInstallPrompts(daysAgo(0), now)).toBe(false);
  });

  it("на второй день добавляется вторая карточка и приглашение", () => {
    expect(advisorLimitFor(daysAgo(1), now)).toBe(2);
    expect(showsInviteTeaser(daysAgo(1), now)).toBe(true);
    expect(showsInstallPrompts(daysAgo(1), now)).toBe(false);
  });

  it("на третий — полный советник и баннеры", () => {
    expect(advisorLimitFor(daysAgo(2), now)).toBe(3);
    expect(showsInstallPrompts(daysAgo(2), now)).toBe(true);
  });

  it("дальше предел советника не растёт", () => {
    expect(advisorLimitFor(daysAgo(365), now)).toBe(3);
    expect(advisorLimitFor(null, now)).toBe(3);
  });
});
