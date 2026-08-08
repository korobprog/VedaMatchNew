import {
  extractQuoteSentences,
  normalizeQuote,
  quoteFingerprint,
} from './quote-normalizer';

describe('quote normalizer', () => {
  it('normalizes case, punctuation, dash variants, and whitespace', () => {
    expect(normalizeQuote('  Служение — это  любовь. ')).toBe(
      'служение - это любовь',
    );
    expect(quoteFingerprint('Служение — это любовь.')).toBe(
      quoteFingerprint(' служение - это любовь '),
    );
  });

  it('normalizes compatibility unicode characters', () => {
    expect(normalizeQuote('ＦＡＩＴＨ')).toBe('faith');
  });

  it('returns a deterministic SHA-256 fingerprint', () => {
    expect(quoteFingerprint('Exact quote')).toMatch(/^[a-f0-9]{64}$/);
    expect(quoteFingerprint('Exact quote')).toBe(
      quoteFingerprint('Exact quote'),
    );
  });
});

describe('extractQuoteSentences', () => {
  it('extracts every quotable sentence from a long text, not just the first', () => {
    const chapter = [
      'A short intro.',
      'This first sentence is long enough to be a proper quote candidate.',
      'Hi.',
      'This second sentence is also long enough to be a proper quote candidate.',
      'This third sentence is also long enough to be a proper quote candidate.',
    ].join(' ');

    expect(extractQuoteSentences(chapter)).toEqual([
      'This first sentence is long enough to be a proper quote candidate.',
      'This second sentence is also long enough to be a proper quote candidate.',
      'This third sentence is also long enough to be a proper quote candidate.',
    ]);
  });

  it('falls back to the whole text when there is no sentence-ending punctuation and it fits the length limit', () => {
    expect(extractQuoteSentences('No punctuation here just enough words')).toEqual([
      'No punctuation here just enough words',
    ]);
  });

  it('returns an empty array when nothing qualifies', () => {
    expect(extractQuoteSentences('')).toEqual([]);
    expect(extractQuoteSentences('x'.repeat(600))).toEqual([]);
  });

  it('caps the number of sentences returned from a single very long text', () => {
    const sentence = 'This sentence is long enough to qualify as a quote.';
    const chapter = Array.from({ length: 40 }, () => sentence).join(' ');

    expect(extractQuoteSentences(chapter)).toHaveLength(20);
  });
});
