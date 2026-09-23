import {
  LIBRARY_SHLOKA_LIMITS,
  isLibraryShlokaTitle,
  libraryShlokaSourceLabel,
} from '@vedamatch/shared';
import {
  cleanAcharyas,
  cleanLine,
  cleanMultiline,
  shlokaDescription,
  shlokaFieldsError,
  shlokaTitle,
  sourceError,
} from './shloka-input';
import { searchWhere } from './library-shlokas.service';

const fields = (over: Record<string, string | null> = {}) => ({
  verse: '2.13',
  text: 'dehino ’smin yathā dehe',
  wordByWord: null,
  translation: null,
  commentary: null,
  ...over,
});

describe('cleanMultiline', () => {
  it('сохраняет строки стиха и убирает мусор вокруг', () => {
    expect(
      cleanMultiline(
        '  देहिनोऽस्मिन्  \r\nयथा देहे\t\r\n\r\n\r\n\r\nкомментарий  ',
      ),
    ).toBe('देहिनोऽस्मिन्\nयथा देहे\n\nкомментарий');
  });

  it('пустое и не строка — null', () => {
    expect(cleanMultiline('  \n ')).toBeNull();
    expect(cleanMultiline(42)).toBeNull();
    expect(cleanMultiline(undefined)).toBeNull();
  });
});

describe('cleanLine', () => {
  it('сжимает пробелы и переводы строк', () => {
    expect(cleanLine('  Бхагавад-гита \n 2.13 ')).toBe('Бхагавад-гита 2.13');
    expect(cleanLine('   ')).toBeNull();
  });
});

describe('shlokaFieldsError', () => {
  it('текст шлоки обязателен', () => {
    expect(shlokaFieldsError(fields({ text: null }))).toBe('text_required');
    expect(shlokaFieldsError(fields())).toBeNull();
  });

  it('следит за пределами полей', () => {
    const long = (n: number) => 'x'.repeat(n + 1);
    expect(
      shlokaFieldsError(fields({ text: long(LIBRARY_SHLOKA_LIMITS.text) })),
    ).toBe('text_too_long');
    expect(
      shlokaFieldsError(fields({ verse: long(LIBRARY_SHLOKA_LIMITS.verse) })),
    ).toBe('verse_too_long');
    expect(
      shlokaFieldsError(
        fields({ wordByWord: long(LIBRARY_SHLOKA_LIMITS.wordByWord) }),
      ),
    ).toBe('word_by_word_too_long');
    expect(
      shlokaFieldsError(
        fields({ translation: long(LIBRARY_SHLOKA_LIMITS.translation) }),
      ),
    ).toBe('translation_too_long');
    expect(
      shlokaFieldsError(
        fields({ commentary: long(LIBRARY_SHLOKA_LIMITS.commentary) }),
      ),
    ).toBe('commentary_too_long');
  });
});

describe('sourceError', () => {
  it('источник обязателен', () => {
    expect(sourceError(null)).toBe('source_required');
    expect(sourceError('x'.repeat(301))).toBe('source_too_long');
    expect(sourceError('Бхагавад-гита')).toBeNull();
  });
});

describe('cleanAcharyas', () => {
  it('без блоков — пустой список', () => {
    expect(cleanAcharyas(undefined)).toEqual({ ok: true, acharyas: [] });
  });

  it('чистит поля и сохраняет id для правки', () => {
    expect(
      cleanAcharyas([
        {
          id: 'a-1',
          acharya: '  Шридхара Свами ',
          commentary: ' толкование \r\n',
        },
      ]),
    ).toEqual({
      ok: true,
      acharyas: [
        {
          id: 'a-1',
          acharya: 'Шридхара Свами',
          text: null,
          wordByWord: null,
          translation: null,
          commentary: 'толкование',
        },
      ],
    });
  });

  it('имя обязательно, и пустой блок с одним именем не принимается', () => {
    expect(cleanAcharyas([{ acharya: ' ', commentary: 'x' }])).toEqual({
      ok: false,
      error: 'acharya_name_required',
    });
    expect(cleanAcharyas([{ acharya: 'Рупа Госвами' }])).toEqual({
      ok: false,
      error: 'acharya_empty',
    });
  });

  it('следит за числом блоков и длиной полей', () => {
    const many = Array.from(
      { length: LIBRARY_SHLOKA_LIMITS.acharyas + 1 },
      () => ({ acharya: 'A', text: 'x' }),
    );
    expect(cleanAcharyas(many)).toEqual({
      ok: false,
      error: 'too_many_acharyas',
    });
    expect(
      cleanAcharyas([
        {
          acharya: 'A',
          commentary: 'x'.repeat(LIBRARY_SHLOKA_LIMITS.commentary + 1),
        },
      ]),
    ).toEqual({ ok: false, error: 'acharya_commentary_too_long' });
    expect(cleanAcharyas('не список')).toEqual({
      ok: false,
      error: 'acharyas_invalid',
    });
  });
});

describe('shlokaTitle и shlokaDescription', () => {
  it('заголовок — источник и номер', () => {
    expect(shlokaTitle('Бхагавад-гита', '2.13', 'dehino')).toBe(
      'Бхагавад-гита 2.13',
    );
  });

  it('без номера — источник и первая строка', () => {
    expect(shlokaTitle('Бхагавад-гита', null, 'первая\nвторая')).toBe(
      'Бхагавад-гита: первая',
    );
  });

  it('длинный заголовок обрезается многоточием', () => {
    const title = shlokaTitle('Б', null, 'x'.repeat(500));
    expect(title).toHaveLength(200);
    expect(title.endsWith('…')).toBe(true);
  });

  it('описание — перевод, без него — пословный', () => {
    expect(shlokaDescription('Как  душа\nпереходит', 'dehi — душа')).toBe(
      'Как душа переходит',
    );
    expect(shlokaDescription(null, 'dehi — душа')).toBe('dehi — душа');
    expect(shlokaDescription(null, null)).toBeNull();
  });
});

describe('isLibraryShlokaTitle', () => {
  it('узнаёт рубрику шлок по названию на разных языках', () => {
    for (const title of ['ШЛОКИ', 'Шлока дня', 'Shlokas', 'Ślokas', 'Slokas']) {
      expect(isLibraryShlokaTitle(title)).toBe(true);
    }
    for (const title of ['Ачарьи', 'Бхагавад-гита', '', null]) {
      expect(isLibraryShlokaTitle(title)).toBe(false);
    }
  });
});

describe('libraryShlokaSourceLabel', () => {
  const node = (titleRu: string | null, titleEn: string | null = null) => ({
    titleRu,
    titleEn,
  });

  it('раздел внутри «Шлок» — его название', () => {
    expect(
      libraryShlokaSourceLabel([node('ШЛОКИ')], node('Бхагавад-гита')),
    ).toBe('Бхагавад-гита');
  });

  it('вложенный раздел — цепочка от «Шлок»', () => {
    expect(
      libraryShlokaSourceLabel(
        [node('ШЛОКИ'), node('Шримад-Бхагаватам')],
        node('Песнь 1'),
      ),
    ).toBe('Шримад-Бхагаватам, Песнь 1');
  });

  it('рубрика вне «Шлок» — только её название, английское как запасное', () => {
    expect(
      libraryShlokaSourceLabel([node('Ачарьи')], node(null, 'Upadeshamrita')),
    ).toBe('Upadeshamrita');
  });
});

describe('searchWhere', () => {
  it('без запроса — без условий', () => {
    expect(searchWhere('  ')).toEqual({});
    expect(searchWhere(undefined)).toEqual({});
  });

  it('номер ищет по номеру, а не вхождением: «2.13» не находит «12.13»', () => {
    const where = searchWhere('2:13') as {
      shloka: { is: { OR: Array<{ verse: Record<string, string> }> } };
    };
    const verses = where.shloka.is.OR.map((clause) => clause.verse);
    expect(verses).toEqual([
      { equals: '2.13', mode: 'insensitive' },
      { startsWith: '2.13.', mode: 'insensitive' },
      { startsWith: '2.13-', mode: 'insensitive' },
      { endsWith: ' 2.13', mode: 'insensitive' },
    ]);
  });

  it('слово ищет по тексту, переводу, комментарию и ачарьям', () => {
    const where = JSON.stringify(searchWhere('душа'));
    for (const field of [
      'titleRu',
      'text',
      'wordByWord',
      'translation',
      'commentary',
      'acharyas',
      'acharya',
    ]) {
      expect(where).toContain(`"${field}"`);
    }
    expect(where).toContain('"contains":"душа"');
  });
});
