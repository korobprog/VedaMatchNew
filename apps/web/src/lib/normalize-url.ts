/**
 * Ссылка на сайт без обязательного «https://» (VED-189). Человек набирает
 * «example.com», а сохраняется «https://example.com»: схему дописываем сами,
 * а не заставляем печатать её на телефонной клавиатуре.
 *
 * Не трогаем:
 * - пустое (поле необязательное — пустое так и уходит пустым);
 * - всё, что уже со схемой: `http://`, `https://`, `mailto:`, `tel:` и прочие
 *   (`javascript:` тоже остаётся как есть — пусть его отвергнет проверка,
 *   а не превратит в «https://javascript:…» нормализация);
 * - текст с пробелами внутри и слово без точки в имени сайта: это не адрес,
 *   и с дописанной схемой «битая» выглядела бы годной «https://битая» —
 *   пусть о ней скажет проверка.
 *
 * «example.com:8080» — не схема, а порт: ему схему дописываем.
 * «//example.com» (адрес без схемы, как в разметке) получает «https:».
 */
export function normalizeUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed || /\s/.test(trimmed)) return trimmed;
  const bare = trimmed.startsWith("//") ? trimmed.slice(2) : trimmed;
  // Схема — буквы/цифры/«+.-» до двоеточия, за которым не номер порта.
  if (bare === trimmed && /^[a-z][a-z\d+.-]*:(?!\d)/i.test(trimmed)) {
    return trimmed;
  }
  const host = bare.split(/[/?#:]/)[0] ?? "";
  if (!host.includes(".")) return trimmed;
  return `https://${bare}`;
}
