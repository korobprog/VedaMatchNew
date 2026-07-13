import { createHash } from 'node:crypto';

export function normalizeQuote(text: string): string {
  return text
    .normalize('NFKC')
    .toLocaleLowerCase('ru-RU')
    .replace(/[—–]/g, '-')
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function quoteFingerprint(text: string): string {
  return createHash('sha256').update(normalizeQuote(text)).digest('hex');
}

export function extractQuoteSentence(text: string): string | null {
  const sentence = text
    .split(/(?<=[.!?])\s+/u)
    .map((part) => part.trim())
    .find((part) => part.length >= 20 && part.length <= 500);
  return sentence ?? (text.length > 0 && text.length <= 500 ? text.trim() : null);
}
