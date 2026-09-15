import {
  MAX_FILE_BYTES,
  MAX_IMAGE_BYTES,
  attachmentKindFor,
  buildUploadFilePart,
  maxBytesFor,
  normalizePickedDocument,
  normalizePickedImage,
  uploadDenialMessage,
  validateUpload,
} from './chat-upload-rules';

describe('attachmentKindFor', () => {
  it('распознаёт картинки и файлы, остальное — null', () => {
    expect(attachmentKindFor('image/png')).toBe('image');
    expect(attachmentKindFor('application/pdf')).toBe('file');
    expect(attachmentKindFor('application/zip')).toBeNull();
    expect(attachmentKindFor('audio/mpeg')).toBeNull();
  });
});

describe('maxBytesFor', () => {
  it('у картинки и файла разные лимиты', () => {
    expect(maxBytesFor('image')).toBe(MAX_IMAGE_BYTES);
    expect(maxBytesFor('file')).toBe(MAX_FILE_BYTES);
  });
});

describe('validateUpload', () => {
  it('пропускает картинку и файл в пределах лимита', () => {
    expect(validateUpload({ mimeType: 'image/jpeg', sizeBytes: MAX_IMAGE_BYTES })).toBeNull();
    expect(validateUpload({ mimeType: 'application/pdf', sizeBytes: MAX_FILE_BYTES })).toBeNull();
  });

  it('отказывает неподдержанному типу раньше проверки размера', () => {
    expect(validateUpload({ mimeType: 'application/zip', sizeBytes: 10 })).toBe('unsupported_type');
  });

  it('отказывает превышению лимита у своего типа', () => {
    expect(validateUpload({ mimeType: 'image/png', sizeBytes: MAX_IMAGE_BYTES + 1 })).toBe('file_too_large');
    expect(validateUpload({ mimeType: 'application/pdf', sizeBytes: MAX_FILE_BYTES + 1 })).toBe('file_too_large');
  });
});

describe('uploadDenialMessage', () => {
  it('разные тексты на разные причины отказа', () => {
    expect(uploadDenialMessage('file_too_large')).toMatch(/большой/);
    expect(uploadDenialMessage('unsupported_type')).toMatch(/нельзя отправить/);
  });
});

describe('buildUploadFilePart', () => {
  it('оставляет только uri/name/type для FormData', () => {
    expect(
      buildUploadFilePart({ uri: 'file:///a.jpg', name: 'a.jpg', type: 'image/jpeg', sizeBytes: 100 }),
    ).toEqual({ uri: 'file:///a.jpg', name: 'a.jpg', type: 'image/jpeg' });
  });
});

describe('normalizePickedImage', () => {
  it('использует mimeType и имя из ассета, когда они есть', () => {
    const result = normalizePickedImage({
      uri: 'file:///photo.png',
      mimeType: 'image/png',
      fileName: 'photo.png',
      fileSize: 2048,
      width: 800,
      height: 600,
    });
    expect(result).toEqual({
      uri: 'file:///photo.png',
      name: 'photo.png',
      type: 'image/png',
      sizeBytes: 2048,
      width: 800,
      height: 600,
    });
  });

  it('угадывает mimeType по расширению, если ассет его не дал', () => {
    const result = normalizePickedImage({ uri: 'file:///cache/img123.jpg', fileSize: 500 }, 42);
    expect(result?.type).toBe('image/jpeg');
    expect(result?.name).toBe('photo-42.jpeg');
  });

  it('без MIME и нераспознанного расширения отдаёт null', () => {
    expect(normalizePickedImage({ uri: 'content://media/external/images/9' })).toBeNull();
  });
});

describe('normalizePickedDocument', () => {
  it('переносит поля документа один в один', () => {
    expect(normalizePickedDocument({ uri: 'file:///doc.pdf', mimeType: 'application/pdf', name: 'doc.pdf', size: 1234 })).toEqual({
      uri: 'file:///doc.pdf',
      name: 'doc.pdf',
      type: 'application/pdf',
      sizeBytes: 1234,
    });
  });

  it('без MIME документ не классифицировать — null', () => {
    expect(normalizePickedDocument({ uri: 'file:///doc', name: 'doc' })).toBeNull();
  });
});
