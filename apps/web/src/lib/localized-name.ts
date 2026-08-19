/**
 * Подпись сущности на языке интерфейса.
 *
 * API отдаёт пары `nameRu`/`nameEn` (рубрики объявлений) или `titleRu`/`titleEn`
 * (разделы рынка, записи библиотеки). Раньше компоненты брали `nameRu` в лоб,
 * и переключатель языка на них не действовал. Здесь: для `en` — английское
 * поле с фолбэком на русское, для `ru` — наоборот; если нет ни того, ни другого,
 * возвращаем пустую строку, чтобы вызывающий мог подставить свою заглушку.
 */
export interface LocalizedNameSource {
  nameRu?: string | null;
  nameEn?: string | null;
  titleRu?: string | null;
  titleEn?: string | null;
}

export function localizedName(item: LocalizedNameSource, locale: string): string {
  const ru = item.nameRu ?? item.titleRu ?? null;
  const en = item.nameEn ?? item.titleEn ?? null;
  const [primary, fallback] = locale === "en" ? [en, ru] : [ru, en];
  return primary?.trim() || fallback?.trim() || "";
}
