import type {
  MarketListingCondition,
  MarketListingKind,
  MarketServiceFormat,
} from '@vedamatch/shared';

export const MAX_TITLE_LENGTH = 140;
export const MAX_DESCRIPTION_LENGTH = 8000;
export const MAX_CATEGORIES_PER_LISTING = 5;
export const MAX_QUANTITY = 100_000;
/** Сутки: дольше — это уже не «услуга», а проект, и его обсуждают в чате. */
export const MAX_SERVICE_DURATION_MINUTES = 1440;

/**
 * Категории, запрещённые правилами Рынка. Дублирует флаг `prohibited` в
 * prisma/market-categories-data.js: сид — данные для БД, а сюда нужен список,
 * доступный в рантайме модуля без обращения к сиду. Расхождение ловит
 * market-listing-validate.spec.ts.
 */
export const PROHIBITED_CATEGORY_SLUGS = new Set([
  'meat-fish-eggs',
  'alcohol-tobacco',
  'leather-goods',
]);

export type ListingValidationError =
  | 'title_required'
  | 'title_too_long'
  | 'description_too_long'
  | 'category_required'
  | 'too_many_categories'
  | 'condition_not_allowed_for_service'
  | 'service_format_required'
  | 'service_duration_invalid'
  | 'quantity_invalid'
  | 'prohibited_category';

export interface ListingValidationInput {
  kind: MarketListingKind;
  titleRu?: string | null;
  titleEn?: string | null;
  descriptionRu?: string | null;
  descriptionEn?: string | null;
  condition?: MarketListingCondition | null;
  quantity?: number | null;
  trackStock?: boolean;
  serviceFormat?: MarketServiceFormat | null;
  serviceDurationMinutes?: number | null;
  categoryIds?: string[];
  /** Слаги выбранных категорий — для проверки запрещённых. */
  categorySlugs?: string[];
}

/**
 * Правила объявления. Возвращает первую нарушенную, а не список: форма на вебе
 * показывает одну ошибку за раз, а порядок проверок здесь совпадает с порядком
 * полей в форме, поэтому пользователь чинит их сверху вниз.
 */
export function validateListing(
  input: ListingValidationInput,
): ListingValidationError | null {
  const titleRu = input.titleRu?.trim() ?? '';
  const titleEn = input.titleEn?.trim() ?? '';
  // Хотя бы один язык: Рынок двуязычный, но заставлять переводить каждое
  // объявление — верный способ не получить ни одного.
  if (!titleRu && !titleEn) return 'title_required';
  if (titleRu.length > MAX_TITLE_LENGTH || titleEn.length > MAX_TITLE_LENGTH) {
    return 'title_too_long';
  }

  const descriptionRu = input.descriptionRu ?? '';
  const descriptionEn = input.descriptionEn ?? '';
  if (
    descriptionRu.length > MAX_DESCRIPTION_LENGTH ||
    descriptionEn.length > MAX_DESCRIPTION_LENGTH
  ) {
    return 'description_too_long';
  }

  if (input.categoryIds !== undefined) {
    if (input.categoryIds.length === 0) return 'category_required';
    if (input.categoryIds.length > MAX_CATEGORIES_PER_LISTING) {
      return 'too_many_categories';
    }
  }

  for (const slug of input.categorySlugs ?? []) {
    if (PROHIBITED_CATEGORY_SLUGS.has(slug)) return 'prohibited_category';
  }

  if (input.kind === 'service') {
    // Состояние («б/у», «как новое») к услуге неприменимо и сломало бы фильтр.
    if (input.condition) return 'condition_not_allowed_for_service';
    if (!input.serviceFormat) return 'service_format_required';
    const duration = input.serviceDurationMinutes;
    if (duration !== null && duration !== undefined) {
      if (
        !Number.isInteger(duration) ||
        duration <= 0 ||
        duration > MAX_SERVICE_DURATION_MINUTES
      ) {
        return 'service_duration_invalid';
      }
    }
    // Остаток у услуги смысла не имеет: она не кончается.
    if (input.trackStock) return 'quantity_invalid';
    if (input.quantity !== null && input.quantity !== undefined) {
      return 'quantity_invalid';
    }
    return null;
  }

  // Товар: количество имеет смысл только при включённом учёте остатка,
  // иначе «в наличии» и «осталось 0» неразличимы в выдаче.
  if (input.trackStock) {
    const quantity = input.quantity;
    if (
      quantity === null ||
      quantity === undefined ||
      !Number.isInteger(quantity) ||
      quantity < 0 ||
      quantity > MAX_QUANTITY
    ) {
      return 'quantity_invalid';
    }
  } else if (input.quantity !== null && input.quantity !== undefined) {
    return 'quantity_invalid';
  }

  return null;
}
