import {
  MAX_WORK_FILE_BYTES,
  MAX_WORK_IMAGE_BYTES,
  validateWorkUpload,
  workAttachmentName,
  workUploadKindFor,
} from './work-upload-rules';

describe('workUploadKindFor', () => {
  it('различает картинку и документ', () => {
    expect(workUploadKindFor('image/png')).toBe('image');
    expect(workUploadKindFor('application/pdf')).toBe('file');
  });

  it('исполняемое и архивы не принимает вовсе', () => {
    // Портал не файлообмен: вложение, которое нельзя посмотреть в браузере,
    // на доске бесполезно, а исполняемое ещё и опасно.
    expect(workUploadKindFor('application/x-msdownload')).toBeNull();
    expect(workUploadKindFor('application/zip')).toBeNull();
    expect(workUploadKindFor('audio/webm')).toBeNull();
  });
});

describe('validateWorkUpload', () => {
  it('картинку в пределах лимита принимает', () => {
    expect(
      validateWorkUpload({ mimetype: 'image/jpeg', size: 5 * 1024 * 1024 }),
    ).toBeNull();
  });

  it('у картинки свой лимит, меньше документного', () => {
    // 15 МБ — законный документ, но неразумная картинка: столько весит только
    // необрезанный кадр с зеркалки, а на доске нужен скриншот.
    const size = 15 * 1024 * 1024;
    expect(validateWorkUpload({ mimetype: 'image/jpeg', size })).toBe(
      'file_too_large',
    );
    expect(
      validateWorkUpload({ mimetype: 'application/pdf', size }),
    ).toBeNull();
  });

  it('ровно по границе — ещё принимаем', () => {
    expect(
      validateWorkUpload({ mimetype: 'image/png', size: MAX_WORK_IMAGE_BYTES }),
    ).toBeNull();
    expect(
      validateWorkUpload({
        mimetype: 'application/pdf',
        size: MAX_WORK_FILE_BYTES,
      }),
    ).toBeNull();
  });

  it('за границей — отказ', () => {
    expect(
      validateWorkUpload({
        mimetype: 'application/pdf',
        size: MAX_WORK_FILE_BYTES + 1,
      }),
    ).toBe('file_too_large');
  });

  it('пустой запрос — отказ, а не падение', () => {
    expect(validateWorkUpload(undefined)).toBe('unsupported_type');
  });

  it('неизвестный тип отвергается раньше размера', () => {
    // Иначе крошечный .exe получал бы «слишком большой файл» и человек
    // пытался бы его сжать.
    expect(validateWorkUpload({ mimetype: 'application/zip', size: 10 })).toBe(
      'unsupported_type',
    );
  });
});

describe('workAttachmentName', () => {
  it('оставляет имя файла как есть', () => {
    expect(workAttachmentName('смета.pdf', 'file')).toBe('смета.pdf');
  });

  it('выбрасывает путь, который приезжает от старых браузеров', () => {
    expect(workAttachmentName('C:\\Users\\makst\\скрин.png', 'image')).toBe(
      'скрин.png',
    );
    expect(workAttachmentName('/tmp/скрин.png', 'image')).toBe('скрин.png');
  });

  it('без имени подставляет род вложения', () => {
    expect(workAttachmentName(undefined, 'image')).toBe('Картинка');
    expect(workAttachmentName('   ', 'file')).toBe('Файл');
  });

  it('чинит кириллицу, приехавшую из multipart побайтно', () => {
    // Ровно то, что пришло от браузера при загрузке «скрин доски.png»:
    // разбор формы читает заголовок как latin1, и имя доезжает мусором.
    const asLatin1 = Buffer.from('скрин доски.png', 'utf8').toString('latin1');

    expect(workAttachmentName(asLatin1, 'image')).toBe('скрин доски.png');
  });

  it('не трогает имя, которое доехало целым', () => {
    // Кириллица здесь выше 0xFF, под правило перекодировки не попадает —
    // иначе починка ломала бы то, что и так было верным.
    expect(workAttachmentName('скрин.png', 'image')).toBe('скрин.png');
    expect(workAttachmentName('report.pdf', 'file')).toBe('report.pdf');
  });

  it('байты, не сложившиеся в UTF-8, оставляет как пришли', () => {
    // Одиночный старший байт — не начало последовательности UTF-8. Портить
    // чужую кодировку нечестнее, чем показать имя как есть.
    expect(workAttachmentName('smårt.pdf', 'file')).toBe('smårt.pdf');
  });

  it('длинное имя режет с начала, сохраняя расширение', () => {
    const name = `${'я'.repeat(300)}.png`;

    const short = workAttachmentName(name, 'image');

    expect(short.length).toBeLessThanOrEqual(120);
    expect(short.endsWith('.png')).toBe(true);
    expect(short.startsWith('…')).toBe(true);
  });
});
