import {
  AVATAR_MIME_EXTENSIONS,
  MAX_AVATAR_BYTES,
  avatarDenialMessage,
  normalizePickedAvatar,
  validateAvatar,
} from './avatar-rules';
import { ALLOWED_IMAGE_MIME, MAX_IMAGE_BYTES } from '@/lib/chat/chat-upload-rules';

/**
 * Правила аватара (VED-332). Смысл проверки — отказать ДО того, как файл
 * уедет по мобильной сети: сервер отобьёт тот же файл 400-м, но уже после
 * выгрузки.
 */

describe('validateAvatar', () => {
  it('jpeg, png и webp принимаются', () => {
    for (const type of Object.keys(AVATAR_MIME_EXTENSIONS)) {
      expect(validateAvatar({ type, sizeBytes: 1024 })).toBeNull();
    }
  });

  it('гифка аватаром не годится, хотя во вложение чата проходит', () => {
    expect(validateAvatar({ type: 'image/gif', sizeBytes: 1024 })).toBe('unsupported_type');
    // Разница не случайна: вложения принимают gif, аватар — нет, и сводить
    // наборы в один нельзя (см. комментарий в avatar-rules.ts).
    expect(ALLOWED_IMAGE_MIME.has('image/gif')).toBe(true);
  });

  it('heic с iPhone тоже не подойдёт', () => {
    expect(validateAvatar({ type: 'image/heic', sizeBytes: 1024 })).toBe('unsupported_type');
  });

  it('ровно 5 МБ проходит, больше — нет', () => {
    expect(validateAvatar({ type: 'image/jpeg', sizeBytes: MAX_AVATAR_BYTES })).toBeNull();
    expect(validateAvatar({ type: 'image/jpeg', sizeBytes: MAX_AVATAR_BYTES + 1 })).toBe('file_too_large');
  });

  /** Потолок аватара строго ниже, чем у фото в переписке: 5 МБ против 10. */
  it('потолок аватара ниже потолка вложения', () => {
    expect(MAX_AVATAR_BYTES).toBeLessThan(MAX_IMAGE_BYTES);
    expect(validateAvatar({ type: 'image/jpeg', sizeBytes: MAX_IMAGE_BYTES })).toBe('file_too_large');
  });

  it('неизвестный размер (0) не повод отказывать — решит сервер', () => {
    expect(validateAvatar({ type: 'image/png', sizeBytes: 0 })).toBeNull();
  });

  it('тип важнее размера: большой gif — это всё-таки «не тот тип»', () => {
    expect(validateAvatar({ type: 'image/gif', sizeBytes: MAX_AVATAR_BYTES + 1 })).toBe('unsupported_type');
  });
});

describe('avatarDenialMessage', () => {
  it('у каждого отказа свой человеческий текст', () => {
    expect(avatarDenialMessage('file_too_large')).toContain('5 МБ');
    expect(avatarDenialMessage('unsupported_type')).toContain('JPEG');
  });
});

describe('normalizePickedAvatar', () => {
  it('берёт MIME и размер из ассета, имя делает своё', () => {
    expect(
      normalizePickedAvatar({
        uri: 'file:///tmp/ImagePicker-abc.jpg',
        mimeType: 'image/jpeg',
        fileName: 'ImagePicker-abc.jpg',
        fileSize: 2048,
      }),
    ).toEqual({ uri: 'file:///tmp/ImagePicker-abc.jpg', name: 'avatar.jpg', type: 'image/jpeg', sizeBytes: 2048 });
  });

  it('без MIME определяет его по расширению пути', () => {
    expect(normalizePickedAvatar({ uri: 'file:///tmp/photo.PNG' })?.type).toBe('image/png');
    expect(normalizePickedAvatar({ uri: 'file:///tmp/photo.webp?x=1' })?.name).toBe('avatar.webp');
  });

  it('расширение без типа — null: слать такое вслепую нельзя', () => {
    expect(normalizePickedAvatar({ uri: 'file:///tmp/photo.xyz' })).toBeNull();
    expect(normalizePickedAvatar({ uri: 'content://media/42' })).toBeNull();
  });

  /**
   * Опознанный, но неподходящий тип возвращается — отказывает `validateAvatar`
   * с точным текстом. Вернуть здесь `null` значило бы показать человеку
   * беспомощное «не удалось определить тип фото» вместо «нужен JPEG, PNG
   * или WebP».
   */
  it('гифка нормализуется, а отсеивается уже проверкой — ради внятного отказа', () => {
    const candidate = normalizePickedAvatar({ uri: 'file:///tmp/a.gif', mimeType: 'image/gif', fileSize: 10 });
    expect(candidate).not.toBeNull();
    expect(validateAvatar(candidate!)).toBe('unsupported_type');
  });

  it('размер без ассета — 0, локальная проверка по нему не отказывает', () => {
    const candidate = normalizePickedAvatar({ uri: 'file:///tmp/a.jpg', mimeType: 'image/jpeg' });
    expect(candidate?.sizeBytes).toBe(0);
    expect(validateAvatar(candidate!)).toBeNull();
  });

  it('у кандидата есть всё, что нужно строителю части формы', () => {
    const candidate = normalizePickedAvatar({ uri: 'file:///tmp/a.jpg', mimeType: 'image/jpeg' });
    expect(candidate).toMatchObject({ uri: expect.any(String), name: expect.any(String), type: expect.any(String) });
  });
});
