import { isLibraryShlokaTitle } from "@vedamatch/shared";

/**
 * Как показывать страницу рубрики, если она про шлоки (VED-386).
 *
 * - `root` — сама рубрика «Шлоки»: внутри разделы-источники, и здесь их
 *   заводят;
 * - `source` — раздел-источник («Бхагавад-гита» внутри «Шлок») или любая
 *   рубрика, где шлоки уже есть: список по порядку стихов, поиск и
 *   «Добавить шлоку» с источником, проставленным по рубрике;
 * - `null` — обычная рубрика.
 *
 * Рубрику «Шлоки» узнаём по названию: на проде она заведена руками как
 * обычная рубрика, флага у неё нет (см. `isLibraryShlokaTitle`).
 */
export type ShlokaSectionMode = "root" | "source" | null;

type Titled = { titleRu: string | null; titleEn: string | null };

function titled(row: Titled): boolean {
  return isLibraryShlokaTitle(row.titleRu) || isLibraryShlokaTitle(row.titleEn);
}

export function shlokaSectionMode(input: {
  category: Titled;
  ancestors: readonly Titled[];
  /** Сколько шлок лежит прямо в рубрике. */
  shlokaTotal: number;
}): ShlokaSectionMode {
  if (input.shlokaTotal > 0) return "source";
  if (input.ancestors.some(titled)) return "source";
  if (titled(input.category)) return "root";
  return null;
}

export type VerseLine =
  | { kind: "blank" }
  | { kind: "devanagari" | "roman"; text: string };

/**
 * Строки стиха для вёрстки: деванагари крупнее и прямым, транслитерация —
 * курсивом. Стих обычно вставляют двумя блоками — оригинал и латиница, —
 * и одинаковый размер для обоих делал бы деванагари мелкой, а латиницу
 * крикливой. Пустая строка между блоками — отбивка.
 */
export function verseLines(text: string): VerseLine[] {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const result: VerseLine[] = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      if (result.length > 0 && result.at(-1)?.kind !== "blank")
        result.push({ kind: "blank" });
      continue;
    }
    result.push({
      kind: /\p{Script=Devanagari}/u.test(line) ? "devanagari" : "roman",
      text: line,
    });
  }
  while (result.at(-1)?.kind === "blank") result.pop();
  return result;
}

/** Первые строки стиха — для списка источника и карточки ленты. */
export function verseExcerpt(text: string, maxLines = 2): string {
  return verseLines(text)
    .filter((line): line is Exclude<VerseLine, { kind: "blank" }> =>
      line.kind !== "blank",
    )
    .slice(0, maxLines)
    .map((line) => line.text)
    .join("\n");
}

/**
 * Ссылка на окно шлоки. `edit` — открыть сразу в правке: стрелки в режиме
 * правки ведут в правку соседней шлоки, чтобы источник заполняли подряд.
 */
export function shlokaHref(id: string, edit = false): string {
  return `/library/entry/${encodeURIComponent(id)}${edit ? "?mode=edit" : ""}`;
}

/** Цель клавиатурной стрелки — только когда фокус не в поле ввода. */
export function arrowTarget(event: {
  key: string;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  target: EventTarget | null;
}): "prev" | "next" | null {
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey)
    return null;
  const target = event.target as HTMLElement | null;
  if (target) {
    const tag = target.tagName;
    if (
      tag === "INPUT" ||
      tag === "TEXTAREA" ||
      tag === "SELECT" ||
      target.isContentEditable
    )
      return null;
  }
  if (event.key === "ArrowLeft") return "prev";
  if (event.key === "ArrowRight") return "next";
  return null;
}

interface TreeNode extends Titled {
  slug: string;
  children: TreeNode[];
}

/**
 * Разделы-источники по всему дереву: всё, что лежит внутри рубрик «Шлоки»,
 * с путём от неё — для выбора, куда добавить шлоку, когда форму открыли не
 * из раздела.
 */
export function shlokaSourcesInTree(
  tree: readonly TreeNode[],
  pick: (row: Titled) => string,
): Array<{ slug: string; label: string }> {
  const result: Array<{ slug: string; label: string }> = [];
  const walk = (nodes: readonly TreeNode[], path: string[] | null) => {
    for (const node of nodes) {
      if (path) {
        const label = [...path, pick(node)].filter(Boolean).join(" / ");
        result.push({ slug: node.slug, label });
        walk(node.children, [...path, pick(node)]);
      } else {
        walk(node.children, titled(node) ? [] : null);
      }
    }
  };
  walk(tree, null);
  return result;
}
