import type {
  AssistantToolReply,
  PortalSearchGroup,
  PortalSearchResponse,
} from '@vedamatch/shared';
import { toLinkCards } from './assistant-cards';
import type { AssistantToolName } from './assistant-tools';

/**
 * Поиск по порталу (VED-75): одно поле на главной — выдача из всех сервисов,
 * которые умеют искать.
 *
 * Сервисы спрашиваются тем же путём, что и в ассистенте: событием
 * `assistant.tool.*`, на которое отвечает слушатель в модуле-владельце.
 * Своего поиска по чужим таблицам здесь нет и быть не должно — см.
 * docs/service-module-contract.md, раздел об ассистенте портала.
 *
 * Чистый модуль: порядок групп, разбор запроса и сборка ответа — под тестом.
 */

/** Порядок групп в выдаче: сначала знание, потом жизнь общины. */
export const PORTAL_SEARCH_SOURCES: readonly {
  tool: AssistantToolName;
  service: string;
}[] = [
  { tool: 'library_search', service: 'library' },
  { tool: 'vedabase_search', service: 'vedabase' },
  { tool: 'music_search', service: 'music' },
  { tool: 'motivation_search', service: 'motivation' },
  { tool: 'notices_search', service: 'notices' },
  { tool: 'market_search', service: 'market' },
  { tool: 'wellness_lookup', service: 'wellness' },
];

export const PORTAL_SEARCH_MIN_QUERY = 2;
export const PORTAL_SEARCH_MAX_QUERY = 120;

/** По пять из каждого сервиса: выдача — оглавление, а не лента. */
export const PORTAL_SEARCH_PER_SERVICE = 5;

/**
 * Сколько ждать сервис. В чате ассистента — двенадцать секунд, там человек
 * ждёт ответа модели; здесь страница выдачи, и медленный сервис не должен
 * держать остальные. Опоздавший попадает в `unavailable`.
 */
export const PORTAL_SEARCH_TIMEOUT_MS = 5_000;

/** Запрос после очистки; `null` — искать нечего. */
export function normalizePortalQuery(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const query = raw
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, PORTAL_SEARCH_MAX_QUERY)
    .trim();
  return query.length >= PORTAL_SEARCH_MIN_QUERY ? query : null;
}

/**
 * Ответ поиска из ответов сервисов, пришедших в порядке
 * PORTAL_SEARCH_SOURCES.
 *
 * Сервис, который ничего не нашёл или отказал, группы не даёт: пустой
 * заголовок «Рынок» без карточек только мешает читать. Сервис, который не
 * ответил вовсе, называется в `unavailable` — иначе пустая выдача выглядела
 * бы как «ничего нет», хотя на деле кто-то просто не успел.
 */
export function portalSearchResult(
  query: string,
  replies: readonly (AssistantToolReply | null)[],
): PortalSearchResponse {
  const groups: PortalSearchGroup[] = [];
  const unavailable: string[] = [];
  PORTAL_SEARCH_SOURCES.forEach((source, index) => {
    const reply = replies[index] ?? null;
    if (!reply) {
      unavailable.push(source.service);
      return;
    }
    if (!reply.ok) return;
    const items = toLinkCards(
      source.service,
      reply.items,
      PORTAL_SEARCH_PER_SERVICE,
    );
    if (items.length > 0) groups.push({ service: source.service, items });
  });
  return { query, groups, unavailable };
}
