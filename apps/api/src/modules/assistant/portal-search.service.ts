import { Injectable } from '@nestjs/common';
import type {
  AccessTokenPayload,
  PortalSearchResponse,
} from '@vedamatch/shared';
import { AssistantToolsService } from './assistant-tools.service';
import { ASSISTANT_TOOLS } from './assistant-tools';
import {
  normalizePortalQuery,
  PORTAL_SEARCH_PER_SERVICE,
  PORTAL_SEARCH_SOURCES,
  PORTAL_SEARCH_TIMEOUT_MS,
  portalSearchResult,
} from './portal-search';

/**
 * Поиск по порталу для поля на главной (VED-75). Сервисы спрашиваются
 * параллельно, теми же инструментами, что и в ассистенте, но без модели:
 * запрос человека уходит в сервисы как есть. См. portal-search.ts.
 */
@Injectable()
export class PortalSearchService {
  constructor(private readonly tools: AssistantToolsService) {}

  async search(
    actor: AccessTokenPayload,
    raw: unknown,
  ): Promise<PortalSearchResponse> {
    const query = normalizePortalQuery(raw);
    if (!query) return { query: null, groups: [], unavailable: [] };

    const replies = await Promise.all(
      PORTAL_SEARCH_SOURCES.map((source) => {
        const tool = ASSISTANT_TOOLS.find((item) => item.name === source.tool);
        if (!tool) return Promise.resolve(null);
        // В журнал вызовов ассистента поиск не пишется: там метрики
        // ассистента, и семь строк на каждый поиск их бы перекосили.
        return this.tools.invoke(
          tool,
          { query, limit: PORTAL_SEARCH_PER_SERVICE },
          actor,
          'ru',
          { record: false, timeoutMs: PORTAL_SEARCH_TIMEOUT_MS },
        );
      }),
    );
    return portalSearchResult(query, replies);
  }
}
