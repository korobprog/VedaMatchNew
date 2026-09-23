import * as SecureStore from 'expo-secure-store';

/**
 * Показывать ли полосу блог-ленты в «Чатах» (VED-334).
 *
 * На сайте ленту можно убрать с главной (VED-238: «сделай возможность
 * убирать Ленту с экрана. В таком режиме всё должно выглядеть по-старому»).
 * В приложении то же самое: скрытая полоса не оставляет в «Чатах» ни
 * заголовка, ни пустого места — экран такой, каким был до ленты.
 *
 * Выбор — свойство устройства, а не данные человека, как и у сайта (там
 * cookie, здесь `SecureStore` — тем же способом, что скорость голосовых и
 * «не сейчас» у обновления). Ключ несёт id человека: на общем телефоне
 * второй вошедший не должен получить чужую настройку.
 */

const KEY_PREFIX = 'vm.blogHome.';

/** По умолчанию лента видна: карточка задачи просит её на первом экране. */
export const BLOG_HOME_DEFAULT_VISIBLE = true;

/** Ключ `SecureStore` допускает только `[A-Za-z0-9._-]`. */
export function blogHomeKey(userId: string): string {
  return `${KEY_PREFIX}${userId.replace(/[^A-Za-z0-9._-]/g, '_')}`;
}

/** Разбор сохранённого значения; `null` — выбора не было. */
export function parseBlogHomeVisible(raw: string | null | undefined): boolean | null {
  if (raw === 'shown') return true;
  if (raw === 'hidden') return false;
  return null;
}

export function serializeBlogHomeVisible(visible: boolean): string {
  return visible ? 'shown' : 'hidden';
}

export async function readBlogHomeVisible(userId: string): Promise<boolean> {
  try {
    const raw = await SecureStore.getItemAsync(blogHomeKey(userId));
    return parseBlogHomeVisible(raw) ?? BLOG_HOME_DEFAULT_VISIBLE;
  } catch {
    // Не прочиталось — показываем: спрятать ленту навсегда из-за сбоя
    // хранилища хуже, чем показать её лишний раз.
    return BLOG_HOME_DEFAULT_VISIBLE;
  }
}

export async function writeBlogHomeVisible(userId: string, visible: boolean): Promise<void> {
  await SecureStore.setItemAsync(blogHomeKey(userId), serializeBlogHomeVisible(visible));
}
