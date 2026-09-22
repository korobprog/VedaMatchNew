import type {
  WellnessHistoryItem,
  WellnessScanRequest,
  WellnessScanResult,
} from '@vedamatch/shared';
import type { ApiClient } from '@/lib/api/client';

/**
 * Маршруты сервиса «Здоровье» (`wellness/*`), которыми пользуется приложение
 * (VED-335). Контракт тот же, что у сайта (`apps/web/src/lib/wellness-api.ts`).
 *
 * Открытую базу Open Food Facts телефон не спрашивает сам, и это решение, а не
 * упрощение: запрос делает сервер. Так найденное кладётся в нашу базу и второй
 * человек у той же полки получает ответ мгновенно, наружу не уходят ни IP
 * пользователей, ни то, что они покупают, а смена источника — правка одного
 * файла на сервере, а не выпуск новой сборки в магазин.
 */
export function createWellnessApi(api: ApiClient) {
  return {
    /**
     * Один запрос на весь ответ: вердикт, карточка товара и запись в историю.
     * Отдельной ручки «найти товар» приложению не нужно — состав без вердикта
     * показывать всё равно нечего.
     */
    scan: (body: WellnessScanRequest) =>
      api.request<WellnessScanResult>('/wellness/scan', {
        method: 'POST',
        body,
      }),
    /** Последние проверки этого человека. */
    history: () => api.request<WellnessHistoryItem[]>('/wellness/history'),
  };
}

export type WellnessApi = ReturnType<typeof createWellnessApi>;

/**
 * Тело запроса для кода из камеры и для набранного руками.
 *
 * `kind` различает их не ради красоты: в истории видно, чем человек
 * пользуется, и если ручной ввод преобладает — камера читает плохо, и это
 * повод чинить сканер, а не удивляться.
 */
export function barcodeScanRequest(
  barcode: string,
  kind: 'barcode' | 'manual',
): WellnessScanRequest {
  return { kind, barcode };
}
