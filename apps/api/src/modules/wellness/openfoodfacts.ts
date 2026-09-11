import {
  WELLNESS_INGREDIENTS_RAW_MAX,
  WELLNESS_PRODUCT_BRAND_MAX,
  WELLNESS_PRODUCT_NAME_MAX,
} from '@vedamatch/shared';

/**
 * Open Food Facts — открытая база продуктов, второй шаг поиска по штрихкоду.
 *
 * Отсюда берётся только строка состава, название, бренд и снимок. Вердикт по
 * ним считает наш справочник: их разметка `vegetarian` чаще всего `unknown`, а
 * лук и чеснок она не видит вовсе.
 *
 * Чистая логика отдельно от сервиса, чтобы разбор чужого ответа и лимиты
 * проверялись тестом, а не на живом API.
 */

export const OFF_DEFAULT_BASE_URL = 'https://world.openfoodfacts.org';

/** Они просят представиться: безымянный клиент под лимитом режется первым. */
export const OFF_USER_AGENT =
  'VedaMatch/1.0 (https://vedamatch.ru; wellness scanner)';

/**
 * Их лимит — 15 запросов товара в минуту с одного IP, и это IP нашего
 * сервера, общий на всех людей. Держим запас, чтобы не упираться в 503.
 */
export const OFF_REQUESTS_PER_MINUTE = 10;

const FIELDS = [
  'product_name_ru',
  'product_name',
  'generic_name_ru',
  'brands',
  'ingredients_text_ru',
  'ingredients_text',
  'ingredients_text_en',
  'image_front_url',
];

export function buildOffProductUrl(baseUrl: string, barcode: string): string {
  const base = baseUrl.replace(/\/+$/, '');
  return `${base}/api/v2/product/${encodeURIComponent(barcode)}?fields=${FIELDS.join(',')}`;
}

export interface OffProduct {
  name: string;
  brand: string | null;
  ingredientsRaw: string;
  imageUrl: string | null;
}

function line(product: Record<string, unknown>, key: string): string {
  const value = product[key];
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

/**
 * Состав с их разметкой аллергенов: `_молоко_` — подчёркивания вокруг слова.
 * Наш разбор их не ждёт, и «_молоко_» не совпало бы с алиасом «молоко».
 */
function composition(product: Record<string, unknown>): string {
  for (const key of [
    'ingredients_text_ru',
    'ingredients_text',
    'ingredients_text_en',
  ]) {
    const value = product[key];
    if (typeof value !== 'string') continue;
    const text = value
      .replace(/_/g, '')
      .replace(/[ \t]+/g, ' ')
      .trim();
    if (text.length >= 3) return text.slice(0, WELLNESS_INGREDIENTS_RAW_MAX);
  }
  return '';
}

/**
 * Ответ API в карточку продукта. `null` — ничего полезного: товара нет или у
 * него нет состава. Без состава судить не о чем, и человеку честнее
 * предложить снимок упаковки, чем показать пустую карточку.
 */
export function parseOffProduct(body: unknown): OffProduct | null {
  if (!body || typeof body !== 'object') return null;
  const { status, product } = body as { status?: unknown; product?: unknown };
  if (status !== 1 || !product || typeof product !== 'object') return null;
  const fields = product as Record<string, unknown>;

  const ingredientsRaw = composition(fields);
  if (!ingredientsRaw) return null;

  const name =
    line(fields, 'product_name_ru') ||
    line(fields, 'product_name') ||
    line(fields, 'generic_name_ru') ||
    'Название не указано';
  const brand = line(fields, 'brands').split(',')[0]?.trim() ?? '';
  const image = line(fields, 'image_front_url');

  return {
    name: name.slice(0, WELLNESS_PRODUCT_NAME_MAX),
    brand: brand ? brand.slice(0, WELLNESS_PRODUCT_BRAND_MAX) : null,
    ingredientsRaw,
    imageUrl: /^https:\/\//.test(image) && image.length <= 500 ? image : null,
  };
}

/**
 * Скользящее окно запросов. Отказ — не ошибка: сканер просто пойдёт дальше
 * без чужой базы и предложит снимок, а не повиснет в очереди.
 */
export class RequestGate {
  private stamps: number[] = [];

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}

  tryTake(now: number): boolean {
    this.stamps = this.stamps.filter((at) => now - at < this.windowMs);
    if (this.stamps.length >= this.limit) return false;
    this.stamps.push(now);
    return true;
  }
}

/**
 * Память о кодах, которых у них нет. Без неё полка с неизвестным товаром
 * съедала бы весь минутный лимит одним и тем же запросом.
 */
export class MissMemory {
  private readonly misses = new Map<string, number>();

  constructor(
    private readonly ttlMs: number,
    private readonly max: number,
  ) {}

  has(barcode: string, now: number): boolean {
    const at = this.misses.get(barcode);
    if (at === undefined) return false;
    if (now - at >= this.ttlMs) {
      this.misses.delete(barcode);
      return false;
    }
    return true;
  }

  remember(barcode: string, now: number): void {
    this.misses.delete(barcode);
    if (this.misses.size >= this.max) {
      // Map хранит порядок вставки: первый ключ — самый старый промах.
      for (const oldest of this.misses.keys()) {
        this.misses.delete(oldest);
        break;
      }
    }
    this.misses.set(barcode, now);
  }
}
