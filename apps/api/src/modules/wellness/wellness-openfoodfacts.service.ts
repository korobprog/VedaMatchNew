import { Injectable, Logger } from '@nestjs/common';
import {
  buildOffProductUrl,
  MissMemory,
  OFF_DEFAULT_BASE_URL,
  OFF_REQUESTS_PER_MINUTE,
  OFF_USER_AGENT,
  parseOffProduct,
  RequestGate,
  type OffProduct,
} from './openfoodfacts';

/** Товар, которого у них нет сегодня, вряд ли появится через час. */
const MISS_TTL_MS = 6 * 60 * 60_000;
const MISS_MAX = 5_000;

/**
 * Поиск по штрихкоду в Open Food Facts, когда нашей базы не хватило.
 *
 * Любой сбой — таймаут, их 503, исчерпанный лимит — возвращает `null`, а не
 * ошибку: чужая база здесь подспорье, а не условие работы сканера. Человек у
 * полки получит приглашение снять состав, как и без неё.
 *
 * `WELLNESS_OFF_ENABLED=0` выключает поиск. `WELLNESS_OFF_BASE_URL` нужен для
 * собственной копии их базы, если трафик перерастёт общий лимит.
 */
@Injectable()
export class WellnessOpenFoodFactsService {
  private readonly log = new Logger(WellnessOpenFoodFactsService.name);
  private readonly gate = new RequestGate(OFF_REQUESTS_PER_MINUTE, 60_000);
  private readonly misses = new MissMemory(MISS_TTL_MS, MISS_MAX);

  private baseUrl(): string | null {
    if (process.env.WELLNESS_OFF_ENABLED === '0') return null;
    return process.env.WELLNESS_OFF_BASE_URL || OFF_DEFAULT_BASE_URL;
  }

  async lookup(barcode: string): Promise<OffProduct | null> {
    const baseUrl = this.baseUrl();
    if (!baseUrl) return null;

    const now = Date.now();
    if (this.misses.has(barcode, now)) return null;
    if (!this.gate.tryTake(now)) {
      this.log.warn('Лимит запросов к Open Food Facts исчерпан на эту минуту');
      return null;
    }

    let response: Response;
    try {
      response = await fetch(buildOffProductUrl(baseUrl, barcode), {
        headers: { 'User-Agent': OFF_USER_AGENT, Accept: 'application/json' },
        signal: AbortSignal.timeout(8_000),
      });
    } catch (error) {
      this.log.warn(`Open Food Facts недоступен: ${String(error)}`);
      return null;
    }

    // 404 — товара у них нет; это ответ, и его стоит запомнить. Прочие коды —
    // их перегрузка, и запоминать её как «нет товара» было бы ошибкой.
    if (response.status === 404) {
      this.misses.remember(barcode, now);
      return null;
    }
    if (!response.ok) {
      this.log.warn(`Open Food Facts ответил ${response.status}`);
      return null;
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      this.log.warn('Open Food Facts вернул не JSON');
      return null;
    }

    const product = parseOffProduct(body);
    if (!product) this.misses.remember(barcode, now);
    return product;
  }
}
