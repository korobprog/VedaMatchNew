/**
 * Загруженное фото человека в переписке (VED-492).
 *
 * У загруженного фото `avatarUrl` пуст, а ссылку даёт только подпись по
 * `avatarKey` — бакет приватный. DTO собеседника собираются в десятках мест
 * (лента, беседы, звонки, статусы, поток), поэтому подписываем их там же, где
 * и файлы переписки, — в `ChatSignedUrlsInterceptor`, одним проходом на ответ.
 *
 * Ключ едет к перехватчику символом, а не полем: `JSON.stringify` символы не
 * видит, так что ключ хранилища не уходит наружу, даже если ответ минует
 * перехватчик, — там просто останется прежний пустой `avatarUrl`.
 */
export const CHAT_AVATAR_KEY: unique symbol = Symbol('chat.avatarKey');

type WithAvatarKey = { [CHAT_AVATAR_KEY]?: string };

/** Пометить DTO человека ключом его загруженного фото. */
export function attachAvatarKey<T extends object>(
  dto: T,
  avatarKey: string | null | undefined,
): T {
  // Неперечисляемым: сравнения в тестах и спред его не видят, а спред,
  // которому пометка нужна, переносит её явно через `avatarKeyOf`.
  if (avatarKey)
    Object.defineProperty(dto, CHAT_AVATAR_KEY, {
      value: avatarKey,
      enumerable: false,
    });
  return dto;
}

/** Ключ фото, которым помечен объект, если помечен. */
export function avatarKeyOf(value: object): string | undefined {
  return (value as WithAvatarKey)[CHAT_AVATAR_KEY];
}

/**
 * Имя поля, под которым ключ переживает сериализацию в Redis между
 * инстансами. Снаружи его не бывает: поток разбирается обратно
 * `reviveAvatarKeys` и подписывается до выдачи.
 */
const WIRE_FIELD = '\u0000chatAvatarKey';

/** `JSON.stringify` с сохранением пометок — для шины событий между инстансами. */
export function stringifyWithAvatarKeys(value: unknown): string {
  return JSON.stringify(value, function (_key, item: unknown) {
    if (typeof item === 'object' && item !== null && !Array.isArray(item)) {
      const avatarKey = avatarKeyOf(item);
      if (avatarKey) return { ...item, [WIRE_FIELD]: avatarKey };
    }
    return item;
  });
}

/** Обратное к `stringifyWithAvatarKeys`: поле снова становится символом. */
export function parseWithAvatarKeys(payload: string): unknown {
  return JSON.parse(payload, (_key, item: unknown) => {
    if (typeof item === 'object' && item !== null && WIRE_FIELD in item) {
      const record = item as Record<string, unknown>;
      const avatarKey = record[WIRE_FIELD];
      delete record[WIRE_FIELD];
      return attachAvatarKey(
        record,
        typeof avatarKey === 'string' ? avatarKey : null,
      );
    }
    return item;
  });
}
