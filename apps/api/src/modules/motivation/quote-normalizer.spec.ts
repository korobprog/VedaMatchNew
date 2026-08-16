import {
  extractQuoteSentences,
  isQuotableSentence,
  normalizeQuote,
  quoteFingerprint,
  snapToSentences,
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

describe('isQuotableSentence', () => {
  const teaching =
    'Смирение означает, что человек не считает себя выше других живых существ.';

  it('accepts a sentence that teaches something', () => {
    expect(isQuotableSentence(teaching)).toBe(true);
  });

  it('rejects biographical narration', () => {
    // Ровно тот случай, из-за которого всё затевалось.
    expect(
      isQuotableSentence(
        'Мукунда облачился в мантию волшебника Мерлина, разрисованную пестрыми квадратами.',
      ),
    ).toBe(false);
  });

  it('rejects dialogue and scene setting', () => {
    expect(
      isQuotableSentence('— Разве это возможно, спросил он у своего учителя?'),
    ).toBe(false);
    expect(
      isQuotableSentence(
        'Прабхупада сказал, что преданность начинается со слушания святого имени.',
      ),
    ).toBe(false);
  });

  it('rejects reportage with dates and numbers', () => {
    expect(
      isQuotableSentence(
        'В 1966 год он основал общество, и преданность стала доступна многим.',
      ),
    ).toBe(false);
  });

  it('rejects a sentence with several proper names in the middle', () => {
    expect(
      isQuotableSentence(
        'Тогда Мукунда, Джанаки и Равиндра нашли в служении общую радость.',
      ),
    ).toBe(false);
  });

  it('rejects anything too short or too long to stand alone', () => {
    expect(isQuotableSentence('Служение — это любовь.')).toBe(false);
    expect(isQuotableSentence(`${teaching} `.repeat(20))).toBe(false);
  });
});

describe('snapToSentences', () => {
  const text =
    'Первое предложение здесь. Второе предложение тоже здесь. Третье предложение в конце.';

  it('does not cut a word in half at either end', () => {
    // Окно 30..50 приходится на середину слов с обеих сторон.
    const excerpt = snapToSentences(text, 30, 50);
    expect(excerpt.startsWith('Второе')).toBe(true);
    expect(text).toContain(excerpt);
    // Хвост тоже целое слово, а не огрызок.
    expect(text).toContain(`${excerpt} `);
  });

  it('does not run away from the window on text without spaces', () => {
    const wall = `${'a'.repeat(700)} цитата здесь. ${'b'.repeat(700)}`;
    const excerpt = snapToSentences(wall, 251, 1_251, 'цитата здесь');
    expect(excerpt.length).toBeLessThanOrEqual(1_000);
    expect(excerpt).toContain('цитата здесь');
  });

  it('keeps the very beginning when the window starts at zero', () => {
    expect(snapToSentences(text, 0, 25).startsWith('Первое')).toBe(true);
  });

  it('stops at the end of the text without overrunning', () => {
    expect(snapToSentences(text, 60, 999)).toBe('Третье предложение в конце.');
  });
});

describe('extractQuoteSentences', () => {
  const first =
    'Смирение означает, что человек не считает себя выше других живых существ.';
  const second =
    'Преданность начинается там, где ум перестаёт искать выгоду для себя.';
  const third =
    'Истина открывается тому, кто готов слушать, а не тому, кто спешит спорить.';

  it('extracts every quotable sentence from a long text, not just the first', () => {
    const chapter = ['A short intro.', first, 'Hi.', second, third].join(' ');

    expect(extractQuoteSentences(chapter)).toEqual([first, second, third]);
  });

  it('keeps a punctuation-free fragment if it still reads as a teaching', () => {
    const aphorism =
      'Служение очищает ум и возвращает разуму его настоящую свободу';
    expect(extractQuoteSentences(aphorism)).toEqual([aphorism]);
  });

  it('drops narrative sentences instead of passing them on', () => {
    const chapter = [
      'Мукунда облачился в мантию волшебника Мерлина, разрисованную квадратами.',
      first,
    ].join(' ');

    expect(extractQuoteSentences(chapter)).toEqual([first]);
  });

  it('returns an empty array when nothing qualifies', () => {
    expect(extractQuoteSentences('')).toEqual([]);
    expect(extractQuoteSentences('x'.repeat(600))).toEqual([]);
  });

  it('caps the number of sentences returned from a single very long text', () => {
    const chapter = Array.from({ length: 40 }, () => first).join(' ');

    expect(extractQuoteSentences(chapter)).toHaveLength(20);
  });
});
