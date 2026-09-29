/* VED-662: копия тестов library/book-files для Библиотеки. */
import {
  BOOK_MIME,
  BOOK_ORPHAN_MIN_AGE_MS,
  bookContentMatches,
  bookDisposition,
  bookFileKey,
  bookFileName,
  bookFormatOfKey,
  bookUploadRejection,
  orphanBookKeys,
} from './book-files';

const MB = 1024 * 1024;
const ENTRY = 'book-1';
const UUID = '0f8fad5b-d9cb-469f-a165-70867728950e';

describe('bookUploadRejection', () => {
  const ok = { fileName: 'Гита.pdf', sizeBytes: 10 * MB, filesCount: 0 };

  it('принимает книгу в пределах размера', () => {
    expect(bookUploadRejection(ok)).toBeNull();
  });

  it('понимает расширение в любом регистре и .djv как djvu', () => {
    expect(bookUploadRejection({ ...ok, fileName: 'SCAN.DJVU' })).toBeNull();
    expect(bookUploadRejection({ ...ok, fileName: 'scan.djv' })).toBeNull();
  });

  it('не принимает то, что не книга', () => {
    expect(bookUploadRejection({ ...ok, fileName: 'setup.exe' })).toBe(
      'unsupported_book_format',
    );
    expect(bookUploadRejection({ ...ok, fileName: 'без расширения' })).toBe(
      'unsupported_book_format',
    );
    expect(bookUploadRejection({ ...ok, fileName: undefined })).toBe(
      'unsupported_book_format',
    );
  });

  it('не принимает пустой и несуразный размер', () => {
    expect(bookUploadRejection({ ...ok, sizeBytes: 0 })).toBe(
      'book_file_empty',
    );
    expect(bookUploadRejection({ ...ok, sizeBytes: 1.5 })).toBe(
      'book_file_empty',
    );
    expect(bookUploadRejection({ ...ok, sizeBytes: '100' })).toBe(
      'book_file_empty',
    );
  });

  it('не принимает файл больше 100 МБ', () => {
    expect(bookUploadRejection({ ...ok, sizeBytes: 100 * MB })).toBeNull();
    expect(bookUploadRejection({ ...ok, sizeBytes: 100 * MB + 1 })).toBe(
      'book_file_too_large',
    );
  });

  it('не даёт прикрепить одиннадцатый файл', () => {
    expect(bookUploadRejection({ ...ok, filesCount: 9 })).toBeNull();
    expect(bookUploadRejection({ ...ok, filesCount: 10 })).toBe(
      'too_many_book_files',
    );
  });
});

describe('bookFileKey и bookFormatOfKey', () => {
  it('ключ, выданный записи, читается обратно с форматом', () => {
    const key = bookFileKey(ENTRY, 'epub', UUID);

    expect(key).toBe(`vedabase/books/${ENTRY}/${UUID}.epub`);
    expect(bookFormatOfKey(key, ENTRY)).toBe('epub');
  });

  it('чужой ключ к записи не привязать', () => {
    // Ключ другой записи, объект Музыки, обход пути, неизвестный формат.
    expect(
      bookFormatOfKey(bookFileKey('entry-2', 'pdf', UUID), ENTRY),
    ).toBeNull();
    expect(bookFormatOfKey(`music/u1/${UUID}.mp3`, ENTRY)).toBeNull();
    expect(
      bookFormatOfKey(`vedabase/books/${ENTRY}/../book-2/${UUID}.pdf`, ENTRY),
    ).toBeNull();
    expect(
      bookFormatOfKey(`vedabase/books/${ENTRY}/${UUID}.exe`, ENTRY),
    ).toBeNull();
    expect(bookFormatOfKey(undefined, ENTRY)).toBeNull();
  });
});

describe('bookFileName', () => {
  it('оставляет имя без пути и ставит расширение по формату', () => {
    expect(bookFileName('C:\\Книги\\Бхагавад-гита.PDF', 'pdf')).toBe(
      'Бхагавад-гита.pdf',
    );
    expect(bookFileName('scan.djv', 'djvu')).toBe('scan.djvu');
  });

  it('вычищает управляющие символы и кавычки', () => {
    const tab = String.fromCharCode(9);
    expect(bookFileName(`Шри${tab}"Ишопанишад".epub`, 'epub')).toBe(
      'Шри Ишопанишад.epub',
    );
  });

  it('длинное имя обрезает, пустое заменяет', () => {
    const long = `${'я'.repeat(300)}.txt`;
    expect(bookFileName(long, 'txt')).toBe(`${'я'.repeat(150)}.txt`);
    expect(bookFileName('   .pdf', 'pdf')).toBe('book.pdf');
    expect(bookFileName(null, 'fb2')).toBe('book.fb2');
  });
});

describe('bookDisposition', () => {
  it('pdf открывается в браузере, остальное скачивается', () => {
    expect(bookDisposition('a.pdf', 'pdf')).toMatch(/^inline;/);
    expect(bookDisposition('a.epub', 'epub')).toMatch(/^attachment;/);
  });

  it('русское имя — в UTF-8 и с ASCII-заменой для старых браузеров', () => {
    const header = bookDisposition('Гита (1972).djvu', 'djvu');

    expect(header).toContain('filename="____ (1972).djvu"');
    expect(header).toContain(
      "filename*=UTF-8''%D0%93%D0%B8%D1%82%D0%B0%20%281972%29.djvu",
    );
  });
});

describe('BOOK_MIME', () => {
  it('знает тип для каждого формата — иначе подпись заливки разойдётся', () => {
    for (const mime of Object.values(BOOK_MIME)) {
      expect(mime).toMatch(/^[a-z]+\/[a-z0-9.+-]+$/);
    }
  });
});

describe('bookContentMatches', () => {
  const bytes = (text: string, pad = 0) =>
    new Uint8Array([
      ...Buffer.from(text, 'latin1'),
      ...new Array<number>(pad).fill(1),
    ]);
  const at = (offset: number, text: string) => {
    const head = new Uint8Array(offset + text.length).fill(1);
    head.set(Buffer.from(text, 'latin1'), offset);
    return head;
  };

  it('узнаёт книгу по началу файла', () => {
    expect(bookContentMatches('pdf', bytes('%PDF-1.7\n'))).toBe(true);
    expect(bookContentMatches('pdf', at(200, '%PDF-1.4'))).toBe(true);
    expect(bookContentMatches('epub', bytes('PK\x03\x04', 20))).toBe(true);
    expect(bookContentMatches('docx', bytes('PK\x03\x04', 20))).toBe(true);
    expect(bookContentMatches('djvu', bytes('AT&TFORM', 8))).toBe(true);
    expect(bookContentMatches('mobi', at(60, 'BOOKMOBI'))).toBe(true);
    expect(bookContentMatches('rtf', bytes('{\\rtf1\\ansi'))).toBe(true);
    expect(
      bookContentMatches(
        'doc',
        new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]),
      ),
    ).toBe(true);
  });

  it('.doc из старого редактора, который на деле RTF, принимает', () => {
    expect(bookContentMatches('doc', bytes('{\\rtf1'))).toBe(true);
  });

  it('fb2 — XML, в том числе с BOM и пробелами в начале', () => {
    expect(bookContentMatches('fb2', bytes('<?xml version="1.0"?>'))).toBe(
      true,
    );
    expect(
      bookContentMatches('fb2', bytes('\xEF\xBB\xBF\n <FictionBook')),
    ).toBe(true);
    expect(bookContentMatches('fb2', bytes('<html><script>'))).toBe(false);
  });

  it('страницу или архив под видом pdf не принимает', () => {
    expect(bookContentMatches('pdf', bytes('<!doctype html><script>'))).toBe(
      false,
    );
    expect(bookContentMatches('pdf', bytes('PK\x03\x04', 20))).toBe(false);
    expect(bookContentMatches('epub', bytes('%PDF-1.7'))).toBe(false);
    expect(bookContentMatches('mobi', bytes('BOOKMOBI'))).toBe(false);
    expect(bookContentMatches('pdf', new Uint8Array())).toBe(false);
  });

  it('txt — любой текст, но не двоичный файл', () => {
    expect(bookContentMatches('txt', bytes('Харе Кришна'))).toBe(true);
    expect(
      bookContentMatches('txt', new Uint8Array([0xff, 0xfe, 0x41, 0])),
    ).toBe(true);
    expect(bookContentMatches('txt', new Uint8Array([0x4d, 0x5a, 0, 3]))).toBe(
      false,
    );
  });
});

describe('orphanBookKeys', () => {
  const now = new Date('2026-09-30T12:00:00.000Z');
  const old = new Date('2026-09-30T09:00:00.000Z');
  const fresh = new Date('2026-09-30T11:00:00.000Z');
  const key = (id: string) => `vedabase/books/book-1/${id}.pdf`;
  const A = '0f8fad5b-d9cb-469f-a165-70867728950e';
  const B = '1f8fad5b-d9cb-469f-a165-70867728950e';
  const C = '2f8fad5b-d9cb-469f-a165-70867728950e';

  it('берёт старый объект без строки в базе', () => {
    expect(
      orphanBookKeys(
        [{ key: key(A), lastModified: old }],
        new Set<string>(),
        now,
      ),
    ).toEqual([key(A)]);
  });

  it('не трогает прикреплённый файл, свежую заливку и чужой ключ', () => {
    expect(
      orphanBookKeys(
        [
          { key: key(A), lastModified: old },
          { key: key(B), lastModified: fresh },
          { key: key(C), lastModified: null },
          { key: 'vedabase/books/book-1/cover.webp', lastModified: old },
          { key: `vedabase/books/book-1/nested/${A}.pdf`, lastModified: old },
          { key: `music/covers/${A}.pdf`, lastModified: old },
        ],
        new Set([key(A)]),
        now,
      ),
    ).toEqual([]);
  });

  it('ровно на границе двух часов объект уже брошен', () => {
    const border = new Date(now.getTime() - BOOK_ORPHAN_MIN_AGE_MS);
    expect(
      orphanBookKeys([{ key: key(A), lastModified: border }], new Set(), now),
    ).toEqual([key(A)]);
  });
});
