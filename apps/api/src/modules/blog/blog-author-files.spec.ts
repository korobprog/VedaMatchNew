/* VED-686: файлы личной страницы автора. */
import {
  BLOG_AUTHOR_FILE_FORMATS,
  BLOG_AUTHOR_FILES_MAX,
} from '@vedamatch/shared';
import {
  AUTHOR_FILE_MIME,
  authorFileDisposition,
  authorFileFormatOfKey,
  authorFileKey,
  authorFileName,
  authorFileUploadRejection,
  contentDisposition,
} from './blog-author-files';

const MB = 1024 * 1024;
const USER = 'user-1';
const UUID = '0f8fad5b-d9cb-469f-a165-70867728950e';

describe('authorFileUploadRejection', () => {
  const ok = { fileName: 'лекция.mp3', sizeBytes: 10 * MB, filesCount: 0 };

  it('принимает файл в пределах размера', () => {
    expect(authorFileUploadRejection(ok)).toBeNull();
    expect(authorFileUploadRejection({ ...ok, fileName: 'a.DJV' })).toBeNull();
  });

  it('не принимает неизвестный формат и не строку', () => {
    expect(authorFileUploadRejection({ ...ok, fileName: 'setup.exe' })).toBe(
      'unsupported_file_format',
    );
    expect(authorFileUploadRejection({ ...ok, fileName: undefined })).toBe(
      'unsupported_file_format',
    );
  });

  it('не принимает пустой и несуразный размер', () => {
    for (const sizeBytes of [0, -1, 1.5, '10', NaN]) {
      expect(authorFileUploadRejection({ ...ok, sizeBytes })).toBe(
        'file_empty',
      );
    }
  });

  it('лимит размера зависит от вида файла', () => {
    expect(authorFileUploadRejection({ ...ok, sizeBytes: 201 * MB })).toBe(
      'file_too_large',
    );
    expect(
      authorFileUploadRejection({
        ...ok,
        fileName: 'a.mp4',
        sizeBytes: 201 * MB,
      }),
    ).toBeNull();
    expect(
      authorFileUploadRejection({
        ...ok,
        fileName: 'a.mp4',
        sizeBytes: 1025 * MB,
      }),
    ).toBe('file_too_large');
    expect(
      authorFileUploadRejection({
        ...ok,
        fileName: 'a.pdf',
        sizeBytes: 101 * MB,
      }),
    ).toBe('file_too_large');
  });

  it('не принимает файл сверх лимита на страницу', () => {
    expect(
      authorFileUploadRejection({
        ...ok,
        filesCount: BLOG_AUTHOR_FILES_MAX - 1,
      }),
    ).toBeNull();
    expect(
      authorFileUploadRejection({ ...ok, filesCount: BLOG_AUTHOR_FILES_MAX }),
    ).toBe('too_many_files');
  });
});

describe('AUTHOR_FILE_MIME', () => {
  it('есть тип для каждого принимаемого формата', () => {
    for (const format of Object.keys(BLOG_AUTHOR_FILE_FORMATS)) {
      expect(AUTHOR_FILE_MIME[format as keyof typeof AUTHOR_FILE_MIME]).toMatch(
        /^[a-z]+\/[\w.+-]+$/,
      );
    }
  });
});

describe('authorFileKey и authorFileFormatOfKey', () => {
  it('ключ лежит под автором и читается обратно', () => {
    const key = authorFileKey(USER, 'mp3', UUID);
    expect(key).toBe(`blog/authors/${USER}/${UUID}.mp3`);
    expect(authorFileFormatOfKey(key, USER)).toBe('mp3');
  });

  it('чужой автор, чужой префикс и неверный uuid не проходят', () => {
    const key = authorFileKey(USER, 'pdf', UUID);
    expect(authorFileFormatOfKey(key, 'user-2')).toBeNull();
    expect(authorFileFormatOfKey(`music/${USER}/${UUID}.pdf`, USER)).toBeNull();
    expect(
      authorFileFormatOfKey(`blog/authors/${USER}/cover.pdf`, USER),
    ).toBeNull();
    expect(
      authorFileFormatOfKey(`blog/authors/${USER}/x/${UUID}.pdf`, USER),
    ).toBeNull();
  });

  it('неизвестный формат и не строка не проходят', () => {
    expect(
      authorFileFormatOfKey(`blog/authors/${USER}/${UUID}.exe`, USER),
    ).toBeNull();
    expect(
      authorFileFormatOfKey(`blog/authors/${USER}/${UUID}.constructor`, USER),
    ).toBeNull();
    expect(authorFileFormatOfKey(undefined, USER)).toBeNull();
    expect(authorFileFormatOfKey(42, USER)).toBeNull();
  });
});

describe('authorFileName', () => {
  it('срезает путь, кавычки и подставляет расширение по формату', () => {
    expect(authorFileName('C:\\dir\\Лекция "1".MP3', 'mp3')).toBe(
      'Лекция 1.mp3',
    );
    expect(authorFileName('../../etc/passwd.txt', 'txt')).toBe('passwd.txt');
  });

  it('управляющие символы становятся пробелом', () => {
    expect(authorFileName('a\tb\nc.pdf', 'pdf')).toBe('a b c.pdf');
  });

  it('пустое имя получает запасное', () => {
    expect(authorFileName('.mp3', 'mp3')).toBe('file.mp3');
    expect(authorFileName(undefined, 'pdf')).toBe('file.pdf');
  });

  it('длинное имя обрезается', () => {
    const name = authorFileName(`${'я'.repeat(400)}.pdf`, 'pdf');
    expect(Array.from(name).length).toBe(150 + '.pdf'.length);
  });
});

describe('contentDisposition и authorFileDisposition', () => {
  it('имя двумя способами: ASCII-замена и UTF-8', () => {
    const header = contentDisposition('attachment', 'Гита (1).pdf');
    expect(header).toContain('filename="____ (1).pdf"');
    expect(header).toContain("filename*=UTF-8''%D0%93");
    expect(header).toContain('%281%29');
  });

  it('аудио, видео, pdf и txt открываются в браузере', () => {
    for (const format of ['mp3', 'mp4', 'pdf', 'txt'] as const) {
      expect(authorFileDisposition(`a.${format}`, format)).toMatch(/^inline;/);
    }
  });

  it('прочие документы отдаются файлом', () => {
    for (const format of ['epub', 'docx', 'xlsx'] as const) {
      expect(authorFileDisposition(`a.${format}`, format)).toMatch(
        /^attachment;/,
      );
    }
  });
});
