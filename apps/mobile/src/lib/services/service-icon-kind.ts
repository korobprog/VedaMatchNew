/**
 * Выбор картинки для карточки каталога сервисов (VED-174, «Иконки»).
 *
 * Порт логики выбора из `apps/web/src/components/icons/service-icons.tsx`:
 * там `switch` идёт по `slug`, а параметр `category` объявлен в сигнатуре,
 * но ни в одной ветке `switch` не используется (проверено:
 * `grep -n category apps/web/src/components/icons/service-icons.tsx` даёт
 * только строку объявления пропа). Здесь то же самое 1:1 — `category`
 * принимается только для совпадения вызова с `ServiceCard.category` на
 * карточке, на выбор картинки он не влияет ни на сайте, ни тут.
 *
 * `slug === 'devotee-space'` на сайте — явный `case`, который проваливается
 * в тот же `default` (лотос с тилаком): отдельной картинки у него нет,
 * поэтому здесь он тоже возвращает `'default'`, как и любой неизвестный
 * или пустой `slug`.
 */
export type ServiceIconKind =
  | 'motivation'
  | 'music'
  | 'union'
  | 'vedabase'
  | 'astro'
  | 'library'
  | 'chat'
  | 'contacts'
  | 'market'
  | 'notices'
  | 'work'
  | 'wellness'
  | 'travel'
  | 'default';

const KNOWN_SLUGS: ReadonlySet<string> = new Set([
  'motivation',
  'music',
  'union',
  'vedabase',
  'astro',
  'library',
  'chat',
  'contacts',
  'market',
  'notices',
  'work',
  'wellness',
  'travel',
]);

export function serviceIconKind(slug: string | null | undefined, category?: string | null): ServiceIconKind {
  // См. комментарий у типа выше: категория на сайте не участвует в выборе.
  void category;
  if (slug && KNOWN_SLUGS.has(slug)) return slug as ServiceIconKind;
  return 'default';
}
