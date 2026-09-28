import type {
  WellnessArticleListResponse,
  WellnessKnowledgeCategoryDto,
} from "@vedamatch/shared";
import { plural } from "@/lib/plural";

/**
 * Разбор текста статьи раздела «Знания». Поддержано ровно то, что пишут
 * руками: заголовки `#`, списки `-`/`*`, цитаты `>`, абзацы через пустую
 * строку, **жирный** и ссылки `[текст](https://…)`. HTML не рендерится —
 * текст собирается в React-элементы, поэтому разметка из статьи не
 * исполняется.
 */
export type ArticleBlock =
  | { type: "heading"; level: 2 | 3 | 4; text: string }
  | { type: "paragraph"; text: string }
  | { type: "list"; items: string[] }
  | { type: "quote"; text: string };

export type ArticleInline =
  | { type: "text"; text: string }
  | { type: "strong"; text: string }
  | { type: "link"; text: string; href: string };

const HEADING = /^(#{1,6})\s+(.*)$/;
const LIST_ITEM = /^[-*+]\s+(.*)$/;
const QUOTE = /^>\s?(.*)$/;

export function parseArticleBody(body: string): ArticleBlock[] {
  const blocks: ArticleBlock[] = [];
  let paragraph: string[] = [];
  let list: string[] = [];
  let quote: string[] = [];

  const flush = () => {
    if (paragraph.length) {
      blocks.push({ type: "paragraph", text: paragraph.join(" ") });
      paragraph = [];
    }
    if (list.length) {
      blocks.push({ type: "list", items: list });
      list = [];
    }
    if (quote.length) {
      blocks.push({ type: "quote", text: quote.join(" ") });
      quote = [];
    }
  };

  for (const raw of body.replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.trim();
    if (!line) {
      flush();
      continue;
    }
    const heading = HEADING.exec(line);
    if (heading) {
      flush();
      const depth = heading[1].length;
      const level = depth <= 1 ? 2 : depth === 2 ? 3 : 4;
      blocks.push({ type: "heading", level, text: heading[2].trim() });
      continue;
    }
    const item = LIST_ITEM.exec(line);
    if (item) {
      if (paragraph.length || quote.length) flush();
      list.push(item[1].trim());
      continue;
    }
    const cited = QUOTE.exec(line);
    if (cited) {
      if (paragraph.length || list.length) flush();
      quote.push(cited[1].trim());
      continue;
    }
    if (list.length || quote.length) flush();
    paragraph.push(line);
  }
  flush();
  return blocks.filter(
    (block) => block.type === "list" || block.text.length > 0,
  );
}

const INLINE = /\*\*([^*]+)\*\*|\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;

export function parseInline(text: string): ArticleInline[] {
  const parts: ArticleInline[] = [];
  let last = 0;
  for (const match of text.matchAll(INLINE)) {
    const index = match.index ?? 0;
    if (index > last)
      parts.push({ type: "text", text: text.slice(last, index) });
    if (match[1] !== undefined) {
      parts.push({ type: "strong", text: match[1] });
    } else {
      parts.push({ type: "link", text: match[2], href: match[3] });
    }
    last = index + match[0].length;
  }
  if (last < text.length) parts.push({ type: "text", text: text.slice(last) });
  return parts;
}

export const COVER_MAX_BYTES = 10 * 1024 * 1024;
const COVER_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

/** Текст ошибки для выбранной обложки или `null`, если файл годится. */
export function coverFileProblem(file: {
  type: string;
  size: number;
}): string | null {
  if (!COVER_TYPES.has(file.type)) return "Обложка — JPEG, PNG или WebP";
  if (file.size > COVER_MAX_BYTES) return "Картинка больше 10 МБ";
  return null;
}

export function articleCountLabel(count: number): string {
  return `${count} ${plural(count, "статья", "статьи", "статей")}`;
}

export function subcategoryCountLabel(count: number): string {
  return `${count} ${plural(count, "подрубрика", "подрубрики", "подрубрик")}`;
}

export function formatArticleDate(iso: string): string {
  return new Date(iso).toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function hasMoreArticles(list: WellnessArticleListResponse): boolean {
  return list.page * list.pageSize < list.total;
}

/** Сколько опубликованных статей во всём поддереве рубрики. */
export function totalArticles(node: WellnessKnowledgeCategoryDto): number {
  return node.children.reduce(
    (sum, child) => sum + totalArticles(child),
    node.articleCount,
  );
}
