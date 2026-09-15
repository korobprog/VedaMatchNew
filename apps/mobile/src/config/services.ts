/**
 * Хелпер склейки ссылок на сайт и аварийный резерв каталога сервисов
 * (VED-174).
 *
 * Раньше здесь был статический список `SERVICE_LINKS` из шести сервисов
 * латиницей — настоящий источник правды теперь `GET /services`
 * (`lib/services/services-api.ts`), тот же каталог, что видит пользователь
 * на сайте под своим аккаунтом: названия и описания правит администратор из
 * админки, переписывать их здесь текстом второй раз — тот же риск
 * расхождения, которого избегает сайт (`apps/web/src/lib/api.ts`, комментарий
 * у `getServiceCard`). Цен и призывов к оплате в приложении нет и быть не
 * должно — правило магазинов приложений.
 */

import type { ServiceCard } from '@vedamatch/shared';

/** Склейка без двойного слэша: origin из варианта сборки уже без хвоста. */
export function serviceUrl(webOrigin: string, path: string): string {
  return `${webOrigin.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}

/**
 * Показывается вкладкой «Сервисы», когда каталог с сервера ещё никогда не
 * загружался успешно (первый запуск без сети, недоступен API) — вместо
 * пустого экрана. Шесть самых стабильных бесплатных разделов, названия
 * сверены с сидом (`apps/api/prisma/seed.cjs`). Не подменяет настоящий
 * каталог: как только `GET /services` ответит впервые, экран переключается
 * на его данные и больше не возвращается к этому списку.
 */
export const FALLBACK_SERVICES: ServiceCard[] = [
  {
    id: 'fallback-union',
    slug: 'union',
    name: 'Знакомства',
    nameEn: 'Union',
    description: 'Знакомства по духовным ценностям',
    iconUrl: null,
    url: '/union',
    status: 'active',
    category: 'core',
    requiresDevoteeVerification: false,
  },
  {
    id: 'fallback-motivation',
    slug: 'motivation',
    name: 'Вдохновение',
    nameEn: 'Motivation',
    description: 'Афоризмы и вдохновляющие истории',
    iconUrl: null,
    url: '/motivation',
    status: 'active',
    category: 'core',
    requiresDevoteeVerification: false,
  },
  {
    id: 'fallback-library',
    slug: 'library',
    name: 'Образование',
    nameEn: 'Library',
    description: 'Книги и лекции',
    iconUrl: null,
    url: '/library',
    status: 'active',
    category: 'core',
    requiresDevoteeVerification: false,
  },
  {
    id: 'fallback-vedabase',
    slug: 'vedabase',
    name: 'Библиотека',
    nameEn: 'Vedabase',
    description: 'Поиск по шастрам',
    iconUrl: null,
    url: '/vedabase',
    status: 'active',
    category: 'core',
    requiresDevoteeVerification: false,
  },
  {
    id: 'fallback-notices',
    slug: 'notices',
    name: 'Объявления',
    nameEn: 'Notices',
    description: 'События общин',
    iconUrl: null,
    url: '/notices',
    status: 'active',
    category: 'core',
    requiresDevoteeVerification: false,
  },
  {
    id: 'fallback-market',
    slug: 'market',
    name: 'Рынок',
    nameEn: 'Market',
    description: 'Товары и услуги',
    iconUrl: null,
    url: '/market',
    status: 'active',
    category: 'core',
    requiresDevoteeVerification: false,
  },
];
