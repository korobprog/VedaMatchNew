import { serviceUrl } from '@/config/services';
import { openWebPortal, type OpenWebPortalResult, type WebPortalOpener } from '@/lib/web-portal';
import type { SearchTarget } from './search-results';

export interface SearchTargetDeps {
  push(route: { pathname: string; params: Record<string, string> }): void;
  opener: WebPortalOpener;
  webOrigin: string;
}

/**
 * Открыть строку выдачи (VED-337): свой экран — переходом, остальное — сайтом
 * в браузере, тем же адресом, что у «Сервисов» (`serviceUrl`), и с тем же
 * запасным путём, что у кнопки «Открыть сайт»: нет Custom Tabs — системный
 * обработчик ссылок, нет и его — честный текст с адресом.
 */
export async function openSearchTarget(
  target: SearchTarget,
  deps: SearchTargetDeps,
): Promise<OpenWebPortalResult | null> {
  if (target.kind === 'route') {
    deps.push({ pathname: target.pathname, params: target.params });
    return null;
  }
  return openWebPortal(serviceUrl(deps.webOrigin, target.path), deps.opener);
}
