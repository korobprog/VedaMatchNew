import {
  MAX_MOMENT_IMAGE_BYTES,
  MAX_MOMENT_VIDEO_BYTES,
  maxMomentBytesFor,
  momentUploadKindFor,
  momentVideoExtension,
  validateMomentUpload,
} from './moments-upload-rules';

describe('вид файла по типу', () => {
  it('картинки — фотография', () => {
    expect(momentUploadKindFor('image/jpeg')).toBe('photo');
    expect(momentUploadKindFor('image/webp')).toBe('photo');
  });

  it('mp4 и webm — ролик', () => {
    expect(momentUploadKindFor('video/mp4')).toBe('video');
    expect(momentUploadKindFor('video/webm')).toBe('video');
  });

  it('.mov отклоняется: HEVC в браузере даёт чёрный экран, а перекодировать нечем', () => {
    expect(momentUploadKindFor('video/quicktime')).toBeNull();
  });

  it('гифка в момент не идёт: у неё нет ни постера, ни длительности', () => {
    expect(momentUploadKindFor('image/gif')).toBeNull();
  });

  it('чужое отклоняется', () => {
    expect(momentUploadKindFor('application/pdf')).toBeNull();
  });
});

describe('пределы размера', () => {
  it('у ролика свой, больше картинки', () => {
    expect(maxMomentBytesFor('video')).toBe(MAX_MOMENT_VIDEO_BYTES);
    expect(maxMomentBytesFor('photo')).toBe(MAX_MOMENT_IMAGE_BYTES);
    expect(MAX_MOMENT_VIDEO_BYTES).toBeGreaterThan(MAX_MOMENT_IMAGE_BYTES);
  });
});

describe('проверка загрузки', () => {
  it('подходящий файл принимается', () => {
    expect(
      validateMomentUpload({ mimetype: 'video/mp4', size: 1024 }),
    ).toBeNull();
  });

  it('слишком большой ролик отбивается по своему пределу', () => {
    expect(
      validateMomentUpload({
        mimetype: 'video/mp4',
        size: MAX_MOMENT_VIDEO_BYTES + 1,
      }),
    ).toBe('file_too_large');
  });

  it('картинка размером с допустимый ролик всё равно велика', () => {
    expect(
      validateMomentUpload({
        mimetype: 'image/jpeg',
        size: MAX_MOMENT_VIDEO_BYTES - 1,
      }),
    ).toBe('file_too_large');
  });

  it('отсутствующий файл — не «слишком большой», а «не тот тип»', () => {
    expect(validateMomentUpload(undefined)).toBe('unsupported_type');
  });
});

describe('расширение ролика', () => {
  it('webm остаётся webm, остальное — mp4', () => {
    expect(momentVideoExtension('video/webm')).toBe('.webm');
    expect(momentVideoExtension('video/mp4')).toBe('.mp4');
  });
});
