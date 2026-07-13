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
