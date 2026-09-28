import type {
  WellnessArticleStatus,
  WellnessKnowledgeCategoryDto,
} from '@vedamatch/shared';
import { WellnessInputError } from './wellness-dto';

/**
 * Архив знаний «Здоровья» (VED-229): чистая логика рубрик и статей.
 * Устройство повторяет рубрики Образования (modules/library/category-*.ts),
 * но код продублирован: контракт сервисного модуля запрещает импорт чужих
 * хелперов.
 */

/** Корень (0) → подрубрика (1) → её подрубрика (2). Глубже не пускаем. */
export const MAX_KNOWLEDGE_DEPTH = 2;

export const TITLE_MAX = 120;
export const DESCRIPTION_MAX = 500;
export const ARTICLE_TITLE_MAX = 200;
export const ARTICLE_BODY_MAX = 100_000;
export const EXCERPT_LENGTH = 220;
export const PAGE_SIZE_DEFAULT = 12;
export const PAGE_SIZE_MAX = 50;

/**
 * Слаги, совпадающие с буквальными сегментами маршрутов веба
 * (`/wellness/knowledge/article/<id>`): рубрика с таким слагом стала бы
 * недостижима.
 */
const RESERVED_SLUGS = new Set(['article']);

const TRANSLIT: Record<string, string> = {
  а: 'a',
  б: 'b',
  в: 'v',
  г: 'g',
  д: 'd',
  е: 'e',
  ё: 'e',
  ж: 'zh',
  з: 'z',
  и: 'i',
  й: 'y',
  к: 'k',
  л: 'l',
  м: 'm',
  н: 'n',
  о: 'o',
  п: 'p',
  р: 'r',
  с: 's',
  т: 't',
  у: 'u',
  ф: 'f',
  х: 'h',
  ц: 'c',
  ч: 'ch',
  ш: 'sh',
  щ: 'sch',
  ъ: '',
  ы: 'y',
  ь: '',
  э: 'e',
  ю: 'yu',
  я: 'ya',
};

/** Латинский слаг из английского названия, а без него — из русского. */
export function buildKnowledgeSlug(input: {
  titleRu?: string | null;
  titleEn?: string | null;
}): string {
  const source = input.titleEn?.trim() ? input.titleEn : input.titleRu;
  const latin = [...(source ?? '').toLocaleLowerCase('ru-RU')]
    .map((char) => TRANSLIT[char] ?? char)
    .join('')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60)
    .replace(/-$/, '');
  if (!latin) return 'category';
  return RESERVED_SLUGS.has(latin) ? `${latin}-1` : latin;
}

/** Попытка 0 — сам слаг, дальше `slug-2`, `slug-3`… */
export function withSlugSuffix(slug: string, attempt: number): string {
  return attempt === 0 ? slug : `${slug}-${attempt + 1}`;
}

export interface KnowledgeRow {
  id: string;
  parentId: string | null;
  slug: string;
  titleRu: string;
  titleEn: string | null;
  descriptionRu: string | null;
  position: number;
  articleCount: number;
}

function byOrder(a: KnowledgeRow, b: KnowledgeRow): number {
  return a.position - b.position || a.titleRu.localeCompare(b.titleRu, 'ru');
}

function toDto(
  row: KnowledgeRow,
  children: WellnessKnowledgeCategoryDto[],
): WellnessKnowledgeCategoryDto {
  return {
    id: row.id,
    parentId: row.parentId,
    slug: row.slug,
    titleRu: row.titleRu,
    titleEn: row.titleEn,
    descriptionRu: row.descriptionRu,
    position: row.position,
    articleCount: row.articleCount,
    children,
  };
}

/**
 * Плоский список → дерево. Узел, чей родитель не пришёл в список, считается
 * корнем: так битая ссылка не прячет рубрику целиком.
 */
export function buildKnowledgeTree(
  rows: KnowledgeRow[],
): WellnessKnowledgeCategoryDto[] {
  const ids = new Set(rows.map((row) => row.id));
  const byParent = new Map<string | null, KnowledgeRow[]>();
  for (const row of rows) {
    const key = row.parentId && ids.has(row.parentId) ? row.parentId : null;
    const list = byParent.get(key) ?? [];
    list.push(row);
    byParent.set(key, list);
  }
  const build = (
    parentId: string | null,
    seen: Set<string>,
  ): WellnessKnowledgeCategoryDto[] =>
    (byParent.get(parentId) ?? [])
      .filter((row) => !seen.has(row.id))
      .sort(byOrder)
      .map((row) => toDto(row, build(row.id, new Set([...seen, row.id]))));
  return build(null, new Set());
}

/** Узел дерева по id, на любой глубине. */
export function findKnowledgeNode(
  nodes: WellnessKnowledgeCategoryDto[],
  id: string,
): WellnessKnowledgeCategoryDto | null {
  for (const node of nodes) {
    if (node.id === id) return node;
    const found = findKnowledgeNode(node.children, id);
    if (found) return found;
  }
  return null;
}

/** Путь от корня до узла включительно. Пусто, если узла нет. */
export function ancestorsOf<T extends { id: string; parentId: string | null }>(
  rows: T[],
  id: string,
): T[] {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const path: T[] = [];
  const seen = new Set<string>();
  let current = byId.get(id);
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    path.unshift(current);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return path;
}

/** Глубина узла: у корня 0. */
export function depthOf(
  rows: { id: string; parentId: string | null }[],
  id: string,
): number {
  return Math.max(0, ancestorsOf(rows, id).length - 1);
}

/** Можно ли завести подрубрику под `parentId`. */
export function canNestUnder(
  rows: { id: string; parentId: string | null }[],
  parentId: string,
): boolean {
  return depthOf(rows, parentId) + 1 <= MAX_KNOWLEDGE_DEPTH;
}

function cleanLine(value: unknown, max: number): string {
  if (typeof value !== 'string') return '';
  return value.replace(/\s+/g, ' ').trim().slice(0, max);
}

function optionalLine(value: unknown, max: number): string | null {
  const text = cleanLine(value, max);
  return text || null;
}

export interface ParsedCategoryInput {
  parentId?: string;
  titleRu?: string;
  titleEn?: string | null;
  descriptionRu?: string | null;
  position?: number;
}

/**
 * Разбор тела запроса рубрики. При создании обязательны родитель и русское
 * название; при правке любое поле необязательно, а родитель не меняется.
 */
export function parseCategoryInput(
  body: Record<string, unknown>,
  mode: 'create' | 'update',
): ParsedCategoryInput {
  const result: ParsedCategoryInput = {};
  if (mode === 'create') {
    const parentId = cleanLine(body.parentId, 64);
    if (!parentId) throw new WellnessInputError('Нужна родительская рубрика');
    result.parentId = parentId;
  }
  if (mode === 'create' || body.titleRu !== undefined) {
    const titleRu = cleanLine(body.titleRu, TITLE_MAX);
    if (!titleRu) throw new WellnessInputError('Нужно название рубрики');
    result.titleRu = titleRu;
  }
  if (body.titleEn !== undefined)
    result.titleEn = optionalLine(body.titleEn, TITLE_MAX);
  if (body.descriptionRu !== undefined)
    result.descriptionRu = optionalLine(body.descriptionRu, DESCRIPTION_MAX);
  if (body.position !== undefined) {
    const position = Number(body.position);
    if (!Number.isInteger(position) || position < 0 || position > 10_000) {
      throw new WellnessInputError('Порядок — целое число от 0');
    }
    result.position = position;
  }
  return result;
}

export interface ParsedArticleInput {
  categoryId?: string;
  title?: string;
  body?: string;
  status?: WellnessArticleStatus;
}

const ARTICLE_STATUSES: WellnessArticleStatus[] = ['draft', 'published'];

/** Текст статьи: переводы строк сохраняются, лишние пустые строки схлопываются. */
export function normalizeBody(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, ARTICLE_BODY_MAX);
}

export function parseArticleInput(
  body: Record<string, unknown>,
  mode: 'create' | 'update',
): ParsedArticleInput {
  const result: ParsedArticleInput = {};
  if (mode === 'create' || body.categoryId !== undefined) {
    const categoryId = cleanLine(body.categoryId, 64);
    if (!categoryId) throw new WellnessInputError('Нужна рубрика');
    result.categoryId = categoryId;
  }
  if (mode === 'create' || body.title !== undefined) {
    const title = cleanLine(body.title, ARTICLE_TITLE_MAX);
    if (!title) throw new WellnessInputError('Нужен заголовок статьи');
    result.title = title;
  }
  if (mode === 'create' || body.body !== undefined) {
    const text = normalizeBody(body.body);
    if (!text) throw new WellnessInputError('Нужен текст статьи');
    result.body = text;
  }
  if (mode === 'create' || body.status !== undefined) {
    const status = body.status ?? 'draft';
    if (!ARTICLE_STATUSES.includes(status as WellnessArticleStatus)) {
      throw new WellnessInputError('Неизвестный статус статьи');
    }
    result.status = status as WellnessArticleStatus;
  }
  return result;
}

/**
 * Анонс для карточки: без разметки markdown и переводов строк, обрезан по
 * слову.
 */
export function articleExcerpt(body: string, length = EXCERPT_LENGTH): string {
  const plain = body
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^>\s?/gm, '')
    .replace(/^[-*+]\s+/gm, '')
    .replace(/[*_`~]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (plain.length <= length) return plain;
  const cut = plain.slice(0, length);
  const space = cut.lastIndexOf(' ');
  return `${(space > length / 2 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

/** Страница списка из query: номер с 1, размер в пределах PAGE_SIZE_MAX. */
export function parsePage(query: { page?: unknown; pageSize?: unknown }): {
  page: number;
  pageSize: number;
} {
  const page = Number(query.page);
  const pageSize = Number(query.pageSize);
  return {
    page: Number.isInteger(page) && page > 0 ? Math.min(page, 10_000) : 1,
    pageSize:
      Number.isInteger(pageSize) && pageSize > 0
        ? Math.min(pageSize, PAGE_SIZE_MAX)
        : PAGE_SIZE_DEFAULT,
  };
}
