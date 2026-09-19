import type { VoiceUploadPart } from './voice-upload-part';

/**
 * `expo/src/winter/fetch/convertFormData.ts` (пакет `expo`, установленный в
 * этом репозитории) решает, поддержана ли часть формы, ровно этой
 * проверкой (цитата, строка близка к текущей на момент правки):
 *
 *   if (typeof entry === 'string') { ... }
 *   else if (entry instanceof Blob) { ... }
 *   else if (typeof entry === 'object' && 'bytes' in entry) { ... }
 *   else { throw new Error('Unsupported FormDataPart implementation'); }
 *
 * Ту же самую ошибку увидела живая проверка сборки 1022 при отправке
 * голосового (feedback-002, блокирующий п.1), а сборка 1023 — при отправке
 * фото тем же механизмом (feedback-003, блокирующий п.1): часть формы
 * `{uri, name, type}` не подходит ни под одну ветку независимо от типа
 * вложения. Тот же предикат и тот же регресс-тест — в
 * `chat-upload-part.spec.ts`, для общего строителя `buildUploadFormPart`.
 *
 * Гонять сам `convertFormDataAsync` в этом тесте не получится честно:
 * глобальный `FormData` под `jest-expo` — не тот класс React Native/Hermes,
 * что на устройстве (`_parts` там даже не определён), и патч `expo`
 * (`installFormDataPatch`) на нём ведёт себя иначе, чем в реальном
 * приложении, — такой тест давал бы ложную уверенность в любую сторону.
 * Проверяем поэтому ровно предикат из первоисточника, а не эмуляцию всего
 * стека.
 */
function isSupportedByExpoFetch(entry: unknown): boolean {
  return typeof entry === 'string' || entry instanceof Blob || (typeof entry === 'object' && entry !== null && 'bytes' in entry);
}

describe('часть FormData для голосового', () => {
  it('{ name, type, bytes } — поддержанная форма (есть свой bytes())', () => {
    const part: VoiceUploadPart = { name: 'voice.m4a', type: 'audio/mp4', bytes: async () => new Uint8Array([1, 2, 3]) };
    expect(isSupportedByExpoFetch(part)).toBe(true);
  });

  it('старая форма {uri,name,type} — та самая, что бросила на устройстве — НЕ поддержана', () => {
    const oldPart = { uri: 'file:///rec.m4a', name: 'voice.m4a', type: 'audio/mp4' };
    expect(isSupportedByExpoFetch(oldPart)).toBe(false);
  });
});
