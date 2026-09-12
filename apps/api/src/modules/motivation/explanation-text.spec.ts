import {
  canAddExplanation,
  explanationChanged,
  explanationOf,
  MAX_EXPLANATION_LENGTH,
  normalizeExplanation,
  quoteOf,
  withExplanation,
} from './explanation-text';

describe('explanationOf', () => {
  it('берёт часть после пустой строки', () => {
    expect(explanationOf('Цитата\n\nПояснение')).toBe('Пояснение');
  });

  it('без пустой строки пояснения нет', () => {
    expect(explanationOf('Только цитата')).toBe('');
  });

  it('пояснение из двух абзацев остаётся целым', () => {
    expect(explanationOf('Цитата\n\nПервый.\n\nВторой.')).toBe(
      'Первый.\n\nВторой.',
    );
  });
});

describe('explanationChanged', () => {
  it('правка самой цитаты автором трактовки не делает', () => {
    expect(
      explanationChanged(
        'Цитата\n\nПояснение',
        'Цитата с опечаткой\n\nПояснение',
      ),
    ).toBe(false);
  });

  it('правка пояснения считается', () => {
    expect(explanationChanged('Цитата\n\nБыло', 'Цитата\n\nСтало')).toBe(true);
  });

  it('добавление пояснения к голой цитате считается', () => {
    expect(explanationChanged('Цитата', 'Цитата\n\nПояснение')).toBe(true);
  });

  it('пробелы по краям смысла не меняют', () => {
    expect(
      explanationChanged('Цитата\n\nПояснение', 'Цитата\n\n  Пояснение  '),
    ).toBe(false);
  });
});

describe('quoteOf', () => {
  it('отдаёт цитату без чьей-либо трактовки', () => {
    expect(quoteOf('Слова автора.\n\nЧьё-то прочтение.')).toBe('Слова автора.');
  });

  it('без пояснения весь текст и есть цитата', () => {
    expect(quoteOf('Только слова автора.')).toBe('Только слова автора.');
  });
});

describe('canAddExplanation', () => {
  it('к афоризму без пояснения — можно', () => {
    expect(canAddExplanation('Ты имеешь право лишь на действие.')).toBe(true);
  });

  it('где пояснение уже есть — нельзя', () => {
    // Пояснение одно: второй человек спорит жалобой, а не поверх чужой
    // трактовки.
    expect(canAddExplanation('Цитата.\n\nУже объяснили.')).toBe(false);
  });
});

describe('normalizeExplanation', () => {
  it('обрезает края', () => {
    expect(normalizeExplanation('  Мысль.  ')).toBe('Мысль.');
  });

  it('схлопывает лишние пустые строки', () => {
    expect(normalizeExplanation('Первое.\n\n\n\nВторое.')).toBe(
      'Первое.\n\nВторое.',
    );
  });

  it('переводы строк Windows не оставляют мусора', () => {
    expect(normalizeExplanation('Первое.\r\nВторое.')).toBe('Первое.\nВторое.');
  });

  it('пустое пояснение — нечего хранить', () => {
    expect(normalizeExplanation('   ')).toBeNull();
    expect(normalizeExplanation('')).toBeNull();
    expect(normalizeExplanation(null)).toBeNull();
    expect(normalizeExplanation(42)).toBeNull();
  });

  it('слишком длинное обрезается', () => {
    expect(normalizeExplanation('я'.repeat(2000))).toHaveLength(
      MAX_EXPLANATION_LENGTH,
    );
  });
});

describe('withExplanation', () => {
  it('складывает цитату и пояснение так, как их читает explanationOf', () => {
    const text = withExplanation('Цитата.', 'Прочтение.');

    expect(text).toBe('Цитата.\n\nПрочтение.');
    expect(explanationOf(text)).toBe('Прочтение.');
    expect(quoteOf(text)).toBe('Цитата.');
  });

  it('пояснение с абзацами читается обратно целиком', () => {
    const text = withExplanation('Цитата.', 'Первое.\n\nВторое.');

    expect(explanationOf(text)).toBe('Первое.\n\nВторое.');
    // Цитата при этом не задета — на картинку уходит только она.
    expect(quoteOf(text)).toBe('Цитата.');
  });
});
