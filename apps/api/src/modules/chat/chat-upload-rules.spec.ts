import {
  attachmentKindFor,
  MAX_FILE_BYTES,
  MAX_IMAGE_BYTES,
  MAX_VOICE_BYTES,
  maxBytesFor,
  validateUpload,
} from './chat-upload-rules';

describe('attachmentKindFor', () => {
  it('различает картинку, голос и документ', () => {
    expect(attachmentKindFor('image/jpeg')).toBe('image');
    expect(attachmentKindFor('audio/webm')).toBe('voice');
    expect(attachmentKindFor('application/pdf')).toBe('file');
  });

  it('не принимает исполняемое и архивы', () => {
    expect(attachmentKindFor('application/x-msdownload')).toBeNull();
    expect(attachmentKindFor('application/zip')).toBeNull();
  });
});

describe('maxBytesFor', () => {
  it('у каждого вида свой предел', () => {
    expect(maxBytesFor('image')).toBe(MAX_IMAGE_BYTES);
    expect(maxBytesFor('voice')).toBe(MAX_VOICE_BYTES);
    expect(maxBytesFor('file')).toBe(MAX_FILE_BYTES);
  });
});

describe('validateUpload', () => {
  it('пропускает картинку в пределах размера', () => {
    expect(validateUpload({ mimetype: 'image/png', size: 1024 })).toBeNull();
  });

  it('отбивает чужой тип', () => {
    expect(validateUpload({ mimetype: 'application/zip', size: 10 })).toBe(
      'unsupported_type',
    );
  });

  it('отбивает превышение размера по виду вложения', () => {
    expect(
      validateUpload({ mimetype: 'image/png', size: MAX_IMAGE_BYTES + 1 }),
    ).toBe('file_too_large');
    // Голосовое той же длины, что и картинка, ещё проходит: предел выше.
    expect(
      validateUpload({ mimetype: 'audio/webm', size: MAX_IMAGE_BYTES + 1 }),
    ).toBeNull();
  });

  it('без файла отвечает как на неподдерживаемый тип', () => {
    expect(validateUpload(undefined)).toBe('unsupported_type');
  });
});
