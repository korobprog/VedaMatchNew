import type { TravelCurrency } from "@vedamatch/shared";
import { formatPrice } from "./price";

/** Неразрывный пробел: им `formatPrice` разделяет разряды и знак валюты. */
export const NBSP = String.fromCharCode(0xa0);

/** Типографский минус. В колонке цифр дефис короче и теряется. */
export const MINUS = String.fromCharCode(0x2212);

const SPACES = new RegExp(`[\\s${NBSP}]`, "g");

/**
 * Сумма из поля ввода в минорных единицах. Принимает то, что набирают
 * руками на ресепшене: «850», «1 700», «1700,50», «1700.5». Возвращает null,
 * если это не сумма — форма тогда подсветит поле, а не отправит ноль.
 */
export function parseMoneyInput(raw: string): number | null {
  const text = raw.replace(SPACES, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return null;
  const [whole, fraction = ""] = text.split(".");
  const minor = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(minor) && minor > 0 ? minor : null;
}

/**
 * Начальный остаток кассы: как сумма, но может быть нулём или долгом со
 * знаком минус (дефисом или типографским).
 */
export function parseSignedMoneyInput(raw: string): number | null {
  const text = raw.replace(SPACES, "").replace(MINUS, "-").replace(",", ".");
  if (!/^-?\d+(\.\d{1,2})?$/.test(text)) return null;
  const negative = text.startsWith("-");
  const [whole, fraction = ""] = text.replace("-", "").split(".");
  const minor = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(minor)) return null;
  return negative ? -minor : minor;
}

/** Обратно в поле ввода: без разрядных пробелов, с запятой. */
export function moneyInputValue(minor: number): string {
  const sign = minor < 0 ? "-" : "";
  const abs = Math.abs(minor);
  const whole = Math.trunc(abs / 100);
  const fraction = abs % 100;
  return fraction
    ? `${sign}${whole},${String(fraction).padStart(2, "0")}`
    : `${sign}${whole}`;
}

/** Сумма со знаком: плюс у дохода, типографский минус у расхода. */
export function formatSigned(minor: number, currency: TravelCurrency): string {
  const text = formatPrice(Math.abs(minor), currency) ?? "";
  if (minor > 0) return `+${text}`;
  if (minor < 0) return `${MINUS}${text}`;
  return text;
}

/** Остаток без знака плюс, но с минусом, если касса в долгу. */
export function formatBalance(minor: number, currency: TravelCurrency): string {
  const text = formatPrice(Math.abs(minor), currency) ?? "";
  return minor < 0 ? `${MINUS}${text}` : text;
}
