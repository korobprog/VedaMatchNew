// Типы сервиса «Здоровье». В коде и маршрутах он зовётся `wellness`: имя
// `health` занято техническим liveness-эндпоинтом для Docker HEALTHCHECK.
//
// Первый раздел — сканер состава: человек у полки наводит камеру на штрихкод
// или снимает сам состав и видит, подходит ли ему продукт.

/**
 * Класс ингредиента — то, из-за чего продукт может не подойти. Список
 * закрытый и короткий: справочник растёт записями, а не значениями этого
 * объединения, иначе каждая новая добавка требовала бы миграции.
 */
export const WELLNESS_INGREDIENT_CLASSES = [
  'meat',
  'fish',
  'egg',
  'dairy',
  'honey',
  'gelatin',
  'rennet',
  'onion',
  'garlic',
  'mushroom',
  'alcohol',
  'caffeine',
  'additive',
  'other',
] as const;
export type WellnessIngredientClass =
  (typeof WELLNESS_INGREDIENT_CLASSES)[number];

/**
 * `contains` — ингредиент назван прямо. `mayContain` — «может содержать следы».
 * `hidden` — формулировка, за которой ингредиент прячется («натуральный
 * ароматизатор», «специи»): состав его не называет, но и чистым продукт
 * назвать нельзя.
 */
export type WellnessIngredientSeverity = 'contains' | 'mayContain' | 'hidden';

/**
 * Ответ человеку у полки. `unknown` — полноправный исход, а не отсутствие
 * ответа: состав разобран не до конца, и промолчать об этом значит сказать
 * «можно» там, где мы не знаем.
 */
export type WellnessVerdict = 'clean' | 'warning' | 'forbidden' | 'unknown';

export type WellnessProductStatus = 'draft' | 'published' | 'rejected';

/**
 * Кто принёс состав. Доверие к строке разное, и источник виден в карточке.
 * `openfoodfacts` — открытая база; её лицензия (ODbL) требует подписи.
 */
export type WellnessProductSource = 'user' | 'ai' | 'admin' | 'openfoodfacts';

/** `photo` — путь без штрихкода: код стёрт, не читается или его нет вовсе. */
export type WellnessScanKind = 'barcode' | 'photo' | 'manual';

export type WellnessReportStatus = 'open' | 'accepted' | 'rejected';

export const WELLNESS_PRODUCT_NAME_MAX = 160;
export const WELLNESS_PRODUCT_BRAND_MAX = 80;
export const WELLNESS_INGREDIENTS_RAW_MAX = 4000;
export const WELLNESS_REPORT_COMMENT_MAX = 1000;

/** Сколько сканов помним. Дальше история интересна разве что архивариусу. */
export const WELLNESS_HISTORY_LIMIT = 200;

/** Запись справочника в ответе: ровно то, что нужно показать в причине. */
export interface WellnessIngredientRef {
  key: string;
  name: string;
  class: WellnessIngredientClass;
  eNumber: string | null;
  note: string | null;
}

/**
 * Причина вердикта. `matchedText` — кусок состава, на который сработало
 * правило: без него человек не может проверить нас, а проверять нас он должен.
 */
export interface WellnessVerdictReason {
  ingredient: WellnessIngredientRef;
  matchedText: string;
  severity: WellnessIngredientSeverity;
}

/** Разобранный состав вместе с ответом. */
export interface WellnessVerdictResult {
  verdict: WellnessVerdict;
  reasons: WellnessVerdictReason[];
  /**
   * Формулировки, за которыми ингредиент прячется: «натуральный ароматизатор»,
   * «специи». Они есть в справочнике — и именно поэтому мы знаем, что состав
   * ими ничего не сказал. Отдельно от `unrecognized`: путать «не нашли слово»
   * и «слово ничего не значит» значит врать человеку в обе стороны.
   */
  hidden: WellnessVerdictReason[];
  /** Куски состава, которых нет в справочнике. */
  unrecognized: string[];
}

export interface WellnessProductCard {
  id: string;
  barcode: string;
  name: string;
  brand: string | null;
  ingredientsRaw: string;
  imageUrl: string | null;
  source: WellnessProductSource;
  status: WellnessProductStatus;
  createdAt: string;
}

/** Ответ сканера. Продукта может не быть — тогда это приглашение его завести. */
export interface WellnessScanResult {
  kind: WellnessScanKind;
  barcode: string | null;
  product: WellnessProductCard | null;
  /**
   * Состав, по которому вынесен вердикт: прочитанный со снимка или взятый у
   * продукта. Пусто у скана штрихкода, не нашедшего продукт, — судить было не
   * о чем, и интерфейс на это опирается.
   */
  ingredientsRaw: string | null;
  result: WellnessVerdictResult;
}

export interface WellnessDietProfileDto {
  excluded: WellnessIngredientClass[];
  excludedKeys: string[];
  updatedAt: string | null;
}

export interface WellnessUpdateDietProfileRequest {
  excluded?: WellnessIngredientClass[];
  excludedKeys?: string[];
}

export interface WellnessScanRequest {
  kind?: WellnessScanKind;
  barcode?: string;
  /** Состав, прочитанный со снимка: сюда кладётся результат распознавания. */
  ingredientsRaw?: string;
  imageUrl?: string;
}

export interface WellnessCreateProductRequest {
  barcode: string;
  name: string;
  brand?: string;
  ingredientsRaw: string;
  imageUrl?: string;
  labelImageUrl?: string;
  /**
   * Снимок упаковки data-URL — тот же, что уходил на распознавание. Нужен
   * только автопроверке (VED-384): по нему ИИ узнаёт товар, пока ищет его в
   * открытых источниках. После проверки стирается.
   */
  labelImageDataUrl?: string;
}

/**
 * Автопроверка карточки, присланной человеком (VED-384). `queued`/`running` —
 * рабочие состояния, остальные окончательные: `accepted` — принята как есть,
 * `refined` — ИИ уточнил название, производителя или состав и карточка
 * принята, `review` — решать модератору, `rejected` — отклонена,
 * `cancelled` — модератор решил раньше очереди.
 */
export type WellnessCheckStatus =
  | 'queued'
  | 'running'
  | 'accepted'
  | 'refined'
  | 'review'
  | 'rejected'
  | 'cancelled';

/**
 * Почему карточка не принята сама. Коды, а не тексты: формулировку для
 * человека собирает тот, кто показывает (админка, уведомление).
 */
export type WellnessCheckReason =
  /** Автопроверка выключена или ИИ не настроен. */
  | 'ai_unavailable'
  /** Три попытки подряд провайдер не ответил. */
  | 'ai_failed'
  /** Ответ ИИ пришёл, но разобрать его не удалось. */
  | 'ai_unreadable'
  /** Дневной бюджет автопроверок исчерпан. */
  | 'daily_budget'
  /** Слишком много карточек от одного человека за сутки. */
  | 'user_daily_limit'
  /** ИИ не нашёл товар в открытых источниках. */
  | 'not_found'
  /** Источники разошлись между собой или с упаковкой. */
  | 'sources_conflict'
  /** Меньше двух независимых сайтов подтверждают товар. */
  | 'too_few_sources'
  /** Ни одну страницу сервер не открыл со штрихкодом на ней. */
  | 'sources_unverified'
  /** Название на упаковке и в источниках — разные товары. */
  | 'name_mismatch'
  /** Состав не нашёлся ни на одной проверенной странице. */
  | 'composition_unconfirmed'
  /** Состав в источниках заметно другой, чем на снимке. */
  | 'composition_mismatch'
  /** Уточнённый состав меняет то, что нашёл справочник. */
  | 'catalog_matches_differ'
  /** ИИ считает, что это не еда, но подтвердить нечем. */
  | 'not_food_unconfirmed'
  /** Не продукт питания — подтверждено источниками. */
  | 'not_food';

/**
 * Насколько источнику можно верить. `verified` — страницу открыл наш сервер
 * и нашёл на ней штрихкод; `opened` — по журналу провайдера страницу открыл
 * поиск, но сами мы её не видели; `claimed` — адрес есть только в словах ИИ.
 */
export type WellnessCheckSourceLevel = 'verified' | 'opened' | 'claimed';

export interface WellnessCheckSource {
  url: string;
  title: string;
  /** Страница называет этот товар (по словам ИИ). */
  confirmsProduct: boolean;
  /** Страница приводит состав (по словам ИИ). */
  confirmsIngredients: boolean;
  level: WellnessCheckSourceLevel;
  /** Сервер нашёл на странице большую часть слов состава. */
  ingredientsOnPage: boolean;
}

/** Автопроверка в админке: что прислал человек, что предложил ИИ и почему. */
export interface WellnessCheckDto {
  status: WellnessCheckStatus;
  reasons: WellnessCheckReason[];
  submitted: { name: string; brand: string | null; ingredientsRaw: string };
  proposal: {
    found: boolean | null;
    notFood: boolean | null;
    name: string | null;
    brand: string | null;
    ingredientsRaw: string | null;
    conflicts: string[];
  };
  sources: WellnessCheckSource[];
  attemptCount: number;
  costUsd: number;
  finishedAt: string | null;
}

export interface WellnessHistoryItem {
  id: string;
  kind: WellnessScanKind;
  barcode: string | null;
  productId: string | null;
  productName: string | null;
  verdict: WellnessVerdict;
  createdAt: string;
}

export interface WellnessIngredientDto extends WellnessIngredientRef {
  id: string;
  nameRu: string;
  nameEn: string;
  aliases: string[];
  severity: WellnessIngredientSeverity;
}

/**
 * Позиция корзины. Вердикт считается на лету под текущие ограничения: человек
 * мог поменять их после того, как положил продукт, и показывать старый ответ
 * значило бы врать.
 */
export interface WellnessBasketItemDto {
  id: string;
  product: WellnessProductCard;
  result: WellnessVerdictResult;
  createdAt: string;
}


/** Сколько чего в корзине. Ради этой строки раздел и нужен. */
export interface WellnessBasketSummary {
  total: number;
  clean: number;
  warning: number;
  forbidden: number;
  unknown: number;
}

export interface WellnessBasketDto {
  items: WellnessBasketItemDto[];
  summary: WellnessBasketSummary;
}

/** Ингредиент рецепта. Свободный текст: рецепты приходят от людей и из книг. */
export interface WellnessRecipeIngredientDto {
  nameRu: string;
  amountRu: string | null;
}

export interface WellnessRecipeCard {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  /** Откуда рецепт: книга или автор. Пусто, пока источник не подтверждён. */
  source: string | null;
  /** Ссылка на оригинал у импортированного рецепта. */
  sourceUrl: string | null;
  kcalPer100g: number | null;
  status: WellnessProductStatus;
  ingredients: WellnessRecipeIngredientDto[];
}

export interface WellnessRecipeDetail extends WellnessRecipeCard {
  steps: string | null;
}

/**
 * Насколько рецепт складывается из того, что уже в корзине. `missing` —
 * главное поле: по нему человек решает, что докупить.
 */
export interface WellnessRecipeMatchDto {
  recipe: WellnessRecipeCard;
  have: string[];
  missing: string[];
  ratio: number;

}
