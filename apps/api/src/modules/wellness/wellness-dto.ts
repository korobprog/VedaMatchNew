import {
  WELLNESS_INGREDIENT_CLASSES,
  WELLNESS_INGREDIENTS_RAW_MAX,
  WELLNESS_PRODUCT_BRAND_MAX,
  WELLNESS_PRODUCT_NAME_MAX,
  WELLNESS_REPORT_COMMENT_MAX,
} from '@vedamatch/shared';
import type {
  WellnessCreateProductRequest,
  WellnessIngredientClass,
  WellnessScanKind,
} from '@vedamatch/shared';
import { normalizeBarcode } from './barcode';

/**
 * Разбор и проверка того, что приходит снаружи.
 *
 * Отдельным модулем, потому что здесь легко ошибиться молча: пустой состав,
 * штрихкод с опечаткой, класс ограничения, которого нет в справочнике. Всё
 * это проверяется тестом, а не глазами при чтении контроллера.
 */

export class WellnessInputError extends Error {}

function text(value: unknown, max: number): string {
  if (typeof value !== 'string') return '';
  return value.replace(/\s+/g, ' ').trim().slice(0, max);
}

/** Состав приходит с переносами строк — их бережём, разбор на них опирается. */
function multiline(value: unknown, max: number): string {
  if (typeof value !== 'string') return '';
  return value
    .replace(/[ \t]+/g, ' ')
    .trim()
    .slice(0, max);
}

const CLASSES = new Set<string>(WELLNESS_INGREDIENT_CLASSES);
const SCAN_KINDS: WellnessScanKind[] = ['barcode', 'photo', 'manual'];

export interface ParsedProductInput {
  barcode: string;
  name: string;
  brand: string | null;
  ingredientsRaw: string;
  imageUrl: string | null;
  labelImageUrl: string | null;
}

export function parseProductInput(
  body: Partial<WellnessCreateProductRequest>,
): ParsedProductInput {
  const barcode =
    typeof body.barcode === 'string' || typeof body.barcode === 'number'
      ? normalizeBarcode(String(body.barcode))
      : null;
  if (!barcode) {
    throw new WellnessInputError('Штрихкод не распознан');
  }
  const name = text(body.name, WELLNESS_PRODUCT_NAME_MAX);
  if (name.length < 2) {
    throw new WellnessInputError('Нужно название продукта');
  }
  const ingredientsRaw = multiline(
    body.ingredientsRaw,
    WELLNESS_INGREDIENTS_RAW_MAX,
  );
  if (ingredientsRaw.length < 3) {
    throw new WellnessInputError('Нужен состав с упаковки');
  }
  return {
    barcode,
    name,
    brand: text(body.brand, WELLNESS_PRODUCT_BRAND_MAX) || null,
    imageUrl: text(body.imageUrl, 500) || null,
    labelImageUrl: text(body.labelImageUrl, 500) || null,
    ingredientsRaw,
  };
}

/**
 * Ограничения человека. Неизвестный класс не роняет запрос, а отбрасывается:
 * старая версия приложения не должна ломать настройку целиком.
 */
export function parseRestrictions(body: {
  excluded?: unknown;
  excludedKeys?: unknown;
}): { excluded: WellnessIngredientClass[]; excludedKeys: string[] } {
  const excluded = Array.isArray(body.excluded)
    ? body.excluded
        .filter(
          (value): value is WellnessIngredientClass =>
            typeof value === 'string' && CLASSES.has(value),
        )
        .filter((value, index, all) => all.indexOf(value) === index)
    : [];
  const excludedKeys = Array.isArray(body.excludedKeys)
    ? body.excludedKeys
        .filter((value): value is string => typeof value === 'string')
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean)
        .filter((value, index, all) => all.indexOf(value) === index)
        .slice(0, 100)
    : [];
  return { excluded, excludedKeys };
}

export interface ParsedScanInput {
  kind: WellnessScanKind;
  barcode: string | null;
  ingredientsRaw: string | null;
  imageUrl: string | null;
}

/**
 * Скан приходит двумя путями. По штрихкоду — нужен код. По фото — нужен
 * распознанный состав: без него сканировать нечего, и молча вернуть «чисто»
 * было бы худшим из возможных ответов.
 */
export function parseScanInput(body: {
  kind?: unknown;
  barcode?: unknown;
  ingredientsRaw?: unknown;
  imageUrl?: unknown;
}): ParsedScanInput {
  const requested =
    typeof body.kind === 'string' &&
    SCAN_KINDS.includes(body.kind as WellnessScanKind)
      ? (body.kind as WellnessScanKind)
      : null;
  // Только строка или число: объект в этом поле дал бы «[object Object]»,
  // который прошёл бы дальше как выдуманный штрихкод.
  const rawBarcode =
    typeof body.barcode === 'string'
      ? body.barcode
      : typeof body.barcode === 'number'
        ? String(body.barcode)
        : '';
  const barcode = rawBarcode ? normalizeBarcode(rawBarcode) : null;
  const ingredientsRaw =
    multiline(body.ingredientsRaw, WELLNESS_INGREDIENTS_RAW_MAX) || null;
  const kind: WellnessScanKind = requested ?? (barcode ? 'barcode' : 'photo');

  if (kind === 'photo' && !ingredientsRaw) {
    throw new WellnessInputError('Состав со снимка не прочитан');
  }
  if (kind !== 'photo' && !barcode) {
    throw new WellnessInputError('Штрихкод не распознан');
  }

  return {
    kind,
    barcode,
    ingredientsRaw,
    imageUrl: text(body.imageUrl, 500) || null,
  };
}

export function parseReportComment(value: unknown): string {
  const comment = text(value, WELLNESS_REPORT_COMMENT_MAX);
  if (comment.length < 5) {
    throw new WellnessInputError('Опишите, что не так с составом');
  }
  return comment;
}

const SEVERITIES = new Set(['contains', 'mayContain', 'hidden']);

export interface ParsedIngredientInput {
  id?: string;
  key: string;
  nameRu: string;
  nameEn: string;
  aliases: string[];
  class: WellnessIngredientClass;
  severity: 'contains' | 'mayContain' | 'hidden';
  eNumber: string | null;
  noteRu: string | null;
}

/**
 * Запись справочника из админки. Алиасы приводятся к тому же виду, в каком
 * разбор отдаёт позиции состава: строчные, «ё» заменена. Иначе алиас,
 * набранный с большой буквы, молча никогда не сработает.
 */
export function parseIngredientInput(body: {
  id?: unknown;
  key?: unknown;
  nameRu?: unknown;
  nameEn?: unknown;
  aliases?: unknown;
  class?: unknown;
  severity?: unknown;
  eNumber?: unknown;
  noteRu?: unknown;
}): ParsedIngredientInput {
  const key = text(body.key, 60).toLowerCase().replace(/\s+/g, '-');
  if (key.length < 2) throw new WellnessInputError('Нужен ключ записи');
  const nameRu = text(body.nameRu, 120);
  if (nameRu.length < 2) throw new WellnessInputError('Нужно название');
  if (typeof body.class !== 'string' || !CLASSES.has(body.class)) {
    throw new WellnessInputError('Неизвестный класс ингредиента');
  }
  const aliases = Array.isArray(body.aliases)
    ? body.aliases
        .filter((value): value is string => typeof value === 'string')
        .map((value) =>
          value.toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim(),
        )
        .filter(Boolean)
        .filter((value, index, all) => all.indexOf(value) === index)
        .slice(0, 50)
    : [];

  return {
    ...(typeof body.id === 'string' && body.id ? { id: body.id } : {}),
    key,
    nameRu,
    nameEn: text(body.nameEn, 120) || nameRu,
    aliases,
    class: body.class as WellnessIngredientClass,
    severity:
      typeof body.severity === 'string' && SEVERITIES.has(body.severity)
        ? (body.severity as ParsedIngredientInput['severity'])
        : 'contains',
    eNumber: text(body.eNumber, 12).toUpperCase() || null,
    noteRu: text(body.noteRu, 300) || null,
  };
}
