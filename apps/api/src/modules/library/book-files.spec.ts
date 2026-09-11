import {
  BOOK_MIME,
  bookDisposition,
  bookFileKey,
  bookFileName,
  bookFormatOfKey,
  bookUploadRejection,
} from './book-files';

const MB = 1024 * 1024;
const ENTRY = 'entry-1';
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

  it('не даёт прикрепить шестой файл', () => {
    expect(bookUploadRejection({ ...ok, filesCount: 4 })).toBeNull();
    expect(bookUploadRejection({ ...ok, filesCount: 5 })).toBe(
      'too_many_book_files',
    );
  });
});

describe('bookFileKey и bookFormatOfKey', () => {
  it('ключ, выданный записи, читается обратно с форматом', () => {
    const key = bookFileKey(ENTRY, 'epub', UUID);

    expect(key).toBe(`library/books/${ENTRY}/${UUID}.epub`);
    expect(bookFormatOfKey(key, ENTRY)).toBe('epub');
  });

  it('чужой ключ к записи не привязать', () => {
    // Ключ другой записи, объект Музыки, обход пути, неизвестный формат.
    expect(
      bookFormatOfKey(bookFileKey('entry-2', 'pdf', UUID), ENTRY),
    ).toBeNull();
    expect(bookFormatOfKey(`music/u1/${UUID}.mp3`, ENTRY)).toBeNull();
    expect(
      bookFormatOfKey(`library/books/${ENTRY}/../entry-2/${UUID}.pdf`, ENTRY),
    ).toBeNull();
    expect(
      bookFormatOfKey(`library/books/${ENTRY}/${UUID}.exe`, ENTRY),
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
