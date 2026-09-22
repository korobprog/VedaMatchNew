import type {
  WellnessCreateProductRequest,
  WellnessHistoryItem,
  WellnessProductCard,
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
    /**
     * Снимок состава → строка состава. Читает модель на сервере, а не
     * телефон: правило «на снимке должно быть слово „Состав“» должно быть
     * одно на сайт и на приложение, а распознавание на устройстве дало бы два
     * разных ответа на один и тот же снимок. Наружу уходит снимок, но не то,
     * кто его сделал: запрос идёт к нашему серверу, а не к провайдеру.
     */
    recognize: (imageDataUrl: string) =>
      api.request<{ ingredientsRaw: string }>('/wellness/recognize', {
        method: 'POST',
        body: { imageDataUrl },
      }),
    /**
     * Добавить продукт в базу. Уходит в очередь модерации: карточка «со слов
     * участника» не отвечает порталу, пока её не проверили.
     */
    createProduct: (body: WellnessCreateProductRequest) =>
      api.request<WellnessProductCard>('/wellness/products', {
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
