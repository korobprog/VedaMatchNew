import type { Prisma } from '@prisma/client';
import type { NoticeStatus } from '@vedamatch/shared';

/**
 * Список объявлений для админки (VED-42, круг 2). Чистый разбор запроса и
 * сборка `where` вынесены сюда отдельно от сервиса — тот же приём, что у
 * `notice-feed-query.ts` рядом: страничность и фильтр проще проверить
 * тестом, чем читая обращение к Prisma глазами.
 *
 * `clampInt` и форма пагинации намеренно повторяют
 * `admin-users.service.ts` (`clampInt`, `page/pageSize/total/totalPages`) —
 * тот же интерфейс страницы в других списках админки, но без импорта
 * оттуда: контракт модуля запрещает читать чужой сервис, мелкий хелпер
 * дублируется на месте.
 */

const NOTICE_STATUSES: readonly NoticeStatus[] = [
  'draft',
  'published',
  'hidden_by_author',
  'resolved',
  'expired',
  'moved_to_market',
  'hidden_by_reports',
  'removed_by_admin',
];

export interface AdminNoticeListQuery {
  q?: string;
  status?: string;
  page?: string;
  pageSize?: string;
}

export interface ParsedAdminNoticeListQuery {
  q: string;
  status: NoticeStatus | null;
  page: number;
  pageSize: number;
}

function clampInt(
  value: string | undefined,
  min: number,
  max: number,
  fallback: number,
): number {
  const parsed = Number.parseInt(value ?? '', 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

/** Пусто или незнакомое значение статуса читаем как «все статусы». */
export function parseAdminNoticeListQuery(
  query: AdminNoticeListQuery,
): ParsedAdminNoticeListQuery {
  const status =
    query.status && (NOTICE_STATUSES as string[]).includes(query.status)
      ? (query.status as NoticeStatus)
      : null;
  return {
    // 200 символов с запасом хватает на любой осмысленный поиск; длиннее —
    // явно случайность (вставили не то поле), а не запрос.
    q: (query.q ?? '').trim().slice(0, 200),
    status,
    page: clampInt(query.page, 1, 10_000, 1),
    pageSize: clampInt(query.pageSize, 1, 100, 20),
  };
}

/**
 * Поиск ищет и в заголовке (обе локали), и в мирском имени автора: карточка
 * VED-42 явно просила искать «по заголовку/автору», а не только по тексту
 * объявления.
 */
export function buildAdminNoticeListWhere(
  parsed: ParsedAdminNoticeListQuery,
): Prisma.NoticeWhereInput {
  const where: Prisma.NoticeWhereInput = {};
  if (parsed.status) where.status = parsed.status;
  if (parsed.q) {
    where.OR = [
      { titleRu: { contains: parsed.q, mode: 'insensitive' } },
      { titleEn: { contains: parsed.q, mode: 'insensitive' } },
      { author: { name: { contains: parsed.q, mode: 'insensitive' } } },
    ];
  }
  return where;
}
