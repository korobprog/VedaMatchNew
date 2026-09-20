import { buildUploadFormPart } from './chat-upload-part';

/**
 * `expo/src/winter/fetch/convertFormData.ts` (пакет `expo`, установленный в
 * этом репозитории) решает, поддержана ли часть формы, ровно этой
 * проверкой (см. `voice-upload-part.spec.ts` — тот же предикат, скопирован
 * сюда намеренно: тест должен ловить регресс независимо от голосового
 * файла):
 *
 *   if (typeof entry === 'string') { ... }
 *   else if (entry instanceof Blob) { ... }
 *   else if (typeof entry === 'object' && 'bytes' in entry) { ... }
 *   else { throw new Error('Unsupported FormDataPart implementation'); }
 *
 * Именно эту ошибку живая проверка сборки 1023 увидела при отправке ФОТО
 * (feedback-003, блокирующий п.1) — до этой правки `chat/[id].tsx`
 * пользовался `{uri,name,type}`, той же формой, что раньше ломала
 * голосовое. Тест ниже не тавтологичен (feedback-003, major п.3): он
 * прогоняет предикат из первоисточника, а не сравнивает ключи объекта —
 * старая форма должна дать `false`, иначе тест не поймал бы возврат к ней.
 */
function isSupportedByExpoFetch(entry: unknown): boolean {
  return typeof entry === 'string' || entry instanceof Blob || (typeof entry === 'object' && entry !== null && 'bytes' in entry);
}

// Имя с префиксом `mock` — единственные внешние переменные, которые jest
// разрешает читать внутри `jest.mock()` (защита от неинициализированных
// моков при подъёме `jest.mock` над импортами).
const mockFileBytes = new Uint8Array([1, 2, 3, 4]);

jest.mock('expo-file-system', () => ({
  File: jest.fn().mockImplementation((uri: string) => ({
    uri,
    bytes: jest.fn().mockResolvedValue(mockFileBytes),
  })),
}));

describe('buildUploadFormPart', () => {
  it('строит часть { name, type, bytes } с байтами файла', async () => {
    const part = await buildUploadFormPart({ uri: 'file:///photo.jpg', name: 'photo.jpg', type: 'image/jpeg' });
    expect(part.name).toBe('photo.jpg');
    expect(part.type).toBe('image/jpeg');
    await expect(part.bytes()).resolves.toEqual(mockFileBytes);
  });

  it('результат поддержан expo-fetch (есть bytes) — фото/файлы/голосовое одним и тем же путём', async () => {
    const part = await buildUploadFormPart({ uri: 'file:///doc.pdf', name: 'doc.pdf', type: 'application/pdf' });
    expect(isSupportedByExpoFetch(part)).toBe(true);
  });
});

describe('регресс: старая форма {uri,name,type}', () => {
  it('та же форма, что раньше слали фото/файлы, — НЕ поддержана expo-fetch', () => {
    const oldPhotoPart = { uri: 'file:///photo.jpg', name: 'photo.jpg', type: 'image/jpeg' };
    expect(isSupportedByExpoFetch(oldPhotoPart)).toBe(false);
  });
});
