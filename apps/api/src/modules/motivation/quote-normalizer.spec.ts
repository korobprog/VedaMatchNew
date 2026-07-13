import { normalizeQuote, quoteFingerprint } from './quote-normalizer';

describe('quote normalizer', () => {
  it('normalizes case, punctuation, dash variants, and whitespace', () => {
    expect(normalizeQuote('  Служение — это  любовь. ')).toBe('служение - это любовь');
    expect(quoteFingerprint('Служение — это любовь.')).toBe(
      quoteFingerprint(' служение - это любовь '),
    );
  });

  it('normalizes compatibility unicode characters', () => {
    expect(normalizeQuote('ＦＡＩＴＨ')).toBe('faith');
  });

  it('returns a deterministic SHA-256 fingerprint', () => {
    expect(quoteFingerprint('Exact quote')).toMatch(/^[a-f0-9]{64}$/);
    expect(quoteFingerprint('Exact quote')).toBe(quoteFingerprint('Exact quote'));
  });
});
