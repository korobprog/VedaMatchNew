import {
  CHAT_DEFAULT_FAVORITE_EMOJIS,
  CHAT_FAVORITE_EMOJI_MAX,
  type ChatFavoriteEmojisDto,
} from "@vedamatch/shared";
import { API_URL, apiFetch } from "@/lib/http-client";

/**
 * «Избранные» смайлики (VED-123): одна категория, которую каждый собирает
 * сам. Пока человек ничего не менял, в ней набор администрации.
 *
 * Свой набор живёт на устройстве, как «Недавние»: это привычка руки, и
 * заводить ради неё таблицу на сервере незачем.
 */
export const FAVORITE_EMOJI_KEY = "vedamatch:chat-favorite-emoji";

/**
 * Свой набор с устройства. `null` — человек его не собирал, показываем набор
 * по умолчанию. Мусор в хранилище читается так же: лучше набор администрации,
 * чем пустая категория.
 */
export function parseFavoriteEmojis(raw: string | null): string[] | null {
  if (raw === null) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return null;
    return value
      .filter((item): item is string => typeof item === "string" && item.length > 0)
      .slice(0, CHAT_FAVORITE_EMOJI_MAX);
  } catch {
    return null;
  }
}

/**
 * Нажатие в режиме настройки: был в избранном — убрать, не было — дописать в
 * конец. Полный набор новых не принимает: иначе молча выпадал бы первый,
 * самый старый и, скорее всего, самый нужный.
 */
export function toggleFavoriteEmoji(
  list: readonly string[],
  emoji: string,
): string[] {
  if (list.includes(emoji)) return list.filter((item) => item !== emoji);
  if (list.length >= CHAT_FAVORITE_EMOJI_MAX) return [...list];
  return [...list, emoji];
}

let defaultsRequest: Promise<string[]> | null = null;

/**
 * Набор администрации. Спрашиваем один раз за сессию: панель открывают
 * часто, а набор меняется редко. Сервер не ответил — встроенный набор, и
 * при следующем открытии панели попробуем снова.
 */
export function loadDefaultFavoriteEmojis(): Promise<string[]> {
  defaultsRequest ??= apiFetch(`${API_URL}/chat/emoji/favorites`, {
    credentials: "include",
  })
    .then(async (res) => {
      if (!res.ok) throw new Error(String(res.status));
      const body = (await res.json()) as ChatFavoriteEmojisDto;
      return body.emojis.length > 0
        ? body.emojis
        : [...CHAT_DEFAULT_FAVORITE_EMOJIS];
    })
    .catch(() => {
      defaultsRequest = null;
      return [...CHAT_DEFAULT_FAVORITE_EMOJIS];
    });
  return defaultsRequest;
}
