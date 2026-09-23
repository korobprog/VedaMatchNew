import * as WebBrowser from 'expo-web-browser';
import { router } from 'expo-router';
import { serviceUrl } from '@/config/services';
import { serviceTarget } from './service-route';

/**
 * Открыть сервис — одинаково с карточки каталога и с чипа панели быстрого
 * доступа (VED-385): свой экран в приложении, если он есть
 * (`service-route.ts`), иначе раздел сайта во встроенном браузере. Раньше это
 * жило прямо в `(tabs)/services.tsx`; второй вызывающий появился — и правило
 * переехало сюда, чтобы чип и карточка не разошлись.
 */
export function openService(service: { slug: string; url: string }, webOrigin: string): void {
  const target = serviceTarget(service);
  if (target.kind === 'in-app') {
    router.push(target.path as never);
    return;
  }
  void WebBrowser.openBrowserAsync(serviceUrl(webOrigin, target.url));
}
