import { CHAT_MAX_ATTACHMENTS } from '@vedamatch/shared';
import {
  MAX_FILE_BYTES,
  MAX_IMAGE_BYTES,
  MAX_VOICE_BYTES,
  attachmentKindFor,
  buildUploadFilePart,
  canPickAttachment,
  maxBytesFor,
  normalizePickedDocument,
  normalizePickedImage,
  remainingAttachmentSlots,
  uploadDenialMessage,
  validateUpload,
} from './chat-upload-rules';

describe('attachmentKindFor', () => {
  it('распознаёт картинки, файлы и голосовое, остальное — null', () => {
    expect(attachmentKindFor('image/png')).toBe('image');
    expect(attachmentKindFor('application/pdf')).toBe('file');
    expect(attachmentKindFor('audio/mp4')).toBe('voice');
    expect(attachmentKindFor('application/zip')).toBeNull();
    // На запись пишем только audio/mp4 (voice-recording-options.ts) — то,
    // что шлёт браузер сайта (webm/ogg/mpeg), с телефона не приходит.
    expect(attachmentKindFor('audio/webm')).toBeNull();
  });
});

describe('maxBytesFor', () => {
  it('у картинки, файла и голосового разные лимиты', () => {
    expect(maxBytesFor('image')).toBe(MAX_IMAGE_BYTES);
    expect(maxBytesFor('file')).toBe(MAX_FILE_BYTES);
    expect(maxBytesFor('voice')).toBe(MAX_VOICE_BYTES);
  });
});

describe('validateUpload', () => {
  it('пропускает картинку, файл и голосовое в пределах лимита', () => {
    expect(validateUpload({ mimeType: 'image/jpeg', sizeBytes: MAX_IMAGE_BYTES })).toBeNull();
    expect(validateUpload({ mimeType: 'application/pdf', sizeBytes: MAX_FILE_BYTES })).toBeNull();
    expect(validateUpload({ mimeType: 'audio/mp4', sizeBytes: MAX_VOICE_BYTES })).toBeNull();
  });

  it('отказывает голосовому крупнее лимита', () => {
    expect(validateUpload({ mimeType: 'audio/mp4', sizeBytes: MAX_VOICE_BYTES + 1 })).toBe('file_too_large');
  });

  it('отказывает неподдержанному типу раньше проверки размера', () => {
    expect(validateUpload({ mimeType: 'application/zip', sizeBytes: 10 })).toBe('unsupported_type');
  });

  it('отказывает превышению лимита у своего типа', () => {
    expect(validateUpload({ mimeType: 'image/png', sizeBytes: MAX_IMAGE_BYTES + 1 })).toBe('file_too_large');
    expect(validateUpload({ mimeType: 'application/pdf', sizeBytes: MAX_FILE_BYTES + 1 })).toBe('file_too_large');
  });
});

describe('remainingAttachmentSlots/canPickAttachment', () => {
  it('считает остаток от лимита и не уходит в минус', () => {
    expect(remainingAttachmentSlots(0)).toBe(CHAT_MAX_ATTACHMENTS);
    expect(remainingAttachmentSlots(9)).toBe(1);
    expect(remainingAttachmentSlots(CHAT_MAX_ATTACHMENTS)).toBe(0);
    expect(remainingAttachmentSlots(CHAT_MAX_ATTACHMENTS + 5)).toBe(0);
  });

  it('нельзя открывать пикер, когда лимит уже занят — этого не хватало «Снять на камеру»', () => {
    expect(canPickAttachment(CHAT_MAX_ATTACHMENTS - 1)).toBe(true);
    expect(canPickAttachment(CHAT_MAX_ATTACHMENTS)).toBe(false);
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

  // VED-286, feedback-002 п.1: эта форма ({uri,name,type}) — та самая, что
  // не пережила отправку голосового живьём («Unsupported FormDataPart
  // implementation», разбор — `voice-upload-part.ts`). Голосовое поэтому
  // грузится не через эту функцию, а через `voice-upload-part.ts:
  // buildVoiceUploadPart` (сырые байты) — фото/файлы здесь не тронуты и
  // проверка ниже просто фиксирует форму на будущее, без утверждения об
  // общем пути с голосовым.
  it('форма части остаётся {uri,name,type} независимо от типа вложения', () => {
    const photoPart = buildUploadFilePart({ uri: 'file:///a.jpg', name: 'a.jpg', type: 'image/jpeg', sizeBytes: 100 });
    expect(Object.keys(photoPart).sort()).toEqual(['name', 'type', 'uri']);
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
