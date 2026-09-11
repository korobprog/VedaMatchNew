import type { Prisma } from '@prisma/client';

/**
 * Поиск задач доски по ключевым словам (VED-76).
 *
 * Каждое слово запроса должно найтись хоть где-то в задаче: в названии,
 * описании, метке, пункте чек-листа, обсуждении или имени исполнителя. «Отчёт
 * март» находит задачу, где «отчёт» в названии, а «март» — в комментарии:
 * люди помнят про задачу обрывки, а не одну фразу целиком.
 *
 * Номер ищется так, как его пишут: `VED-76`, `ved76`, `#76` или просто `76`.
 *
 * Чистая часть — здесь, запрос к базе собирает `WorkBoardsService`.
 */

export const TASK_SEARCH_MAX_LENGTH = 120;
/** Больше слов — это уже не поиск, а вставленный абзац. */
export const TASK_SEARCH_MAX_WORDS = 8;
/** Доска в сотни задач — уже редкость; больше выдача не нужна. */
export const TASK_SEARCH_LIMIT = 500;

/** Слова запроса без повторов. Пусто — искать нечего. */
export function taskSearchWords(query: unknown): string[] {
  if (typeof query !== 'string') return [];
  const words = query
    .slice(0, TASK_SEARCH_MAX_LENGTH)
    .toLowerCase()
    .split(/[\s,;]+/)
    .map((word) => word.replace(/^["«'(]+|["»')]+$/g, ''))
    .filter(Boolean);
  return [...new Set(words)].slice(0, TASK_SEARCH_MAX_WORDS);
}

/**
 * Номер задачи из слова: `ved-76`, `ved76`, `#76`, `76` → 76. Чужой префикс
 * — не номер: «MKT-5» на доске VED не должен находить VED-5.
 */
export function taskNumberOf(word: string, prefix: string): number | null {
  const match = /^#?([a-zа-яё]+)?-?(\d{1,7})$/i.exec(word);
  if (!match) return null;
  if (match[1] && match[1].toLowerCase() !== prefix.toLowerCase()) return null;
  return Number(match[2]);
}

export function taskSearchWhere(
  boardId: string,
  words: readonly string[],
  prefix: string,
): Prisma.WorkTaskWhereInput {
  return {
    boardId,
    // Архив доска не показывает — и поиск не должен находить невидимое.
    archivedAt: null,
    AND: words.map((word) => {
      const contains = { contains: word, mode: 'insensitive' as const };
      const number = taskNumberOf(word, prefix);
      return {
        OR: [
          { title: contains },
          { description: contains },
          { labels: { some: { label: { name: contains } } } },
          { checklist: { some: { text: contains } } },
          { comments: { some: { body: contains } } },
          // Исполнителя ищут и по мирскому имени, и по духовному: на доске
          // подписан тем, что показывает resolveDisplayName.
          { assignee: { name: contains } },
          { assignee: { spiritualName: contains } },
          ...(number !== null ? [{ number }] : []),
        ],
      };
    }),
  };
}
