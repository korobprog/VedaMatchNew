/**
 * Сервисы, которые приложение открывает на сайте.
 *
 * Сканер и карта станут нативными экранами в фазе 5, остальное остаётся
 * ссылкой. Пути сверены с маршрутами `apps/web/src/app`. Цен и призывов к
 * оплате здесь нет и быть не должно: это правило магазинов приложений.
 */

export interface ServiceLink {
  key: string;
  title: string;
  description: string;
  path: string;
}

export const SERVICE_LINKS: ServiceLink[] = [
  { key: 'union', title: 'Union', description: 'Знакомства по дхарме', path: '/union' },
  { key: 'motivation', title: 'Motivation', description: 'Афоризмы и сторис', path: '/motivation' },
  { key: 'library', title: 'Library', description: 'Книги и лекции', path: '/library' },
  { key: 'vedabase', title: 'Vedabase', description: 'Поиск по шастрам', path: '/vedabase' },
  { key: 'notices', title: 'Notices', description: 'События общин', path: '/notices' },
  { key: 'market', title: 'Market', description: 'Товары и услуги', path: '/market' },
];

/** Склейка без двойного слэша: origin из варианта сборки уже без хвоста. */
export function serviceUrl(webOrigin: string, path: string): string {
  return `${webOrigin.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}
