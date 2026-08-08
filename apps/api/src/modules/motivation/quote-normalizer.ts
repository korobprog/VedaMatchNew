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

/**
 * A single long text (e.g. a whole book chapter) can contain many quotable
 * sentences. Capped so one pathological unit can't dominate a discovery batch.
 */
const MAX_SENTENCES_PER_TEXT = 20;

export function extractQuoteSentences(text: string): string[] {
  const sentences = text
    .split(/(?<=[.!?])\s+/u)
    .map((part) => part.trim())
    .filter((part) => part.length >= 20 && part.length <= 500)
    .slice(0, MAX_SENTENCES_PER_TEXT);
  if (sentences.length > 0) return sentences;
  return text.length > 0 && text.length <= 500 ? [text.trim()] : [];
}
