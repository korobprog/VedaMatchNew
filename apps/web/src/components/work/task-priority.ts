import type { WorkTaskPriority } from "@vedamatch/shared";

/**
 * Как важность видна снаружи карточки.
 *
 * Цвет один ничего не сообщает: восьмой мужчина из ста не отличит золото от
 * пурпура, а на солнце их не отличит никто. Поэтому метка всегда пара — точка
 * и слово; цветной край карточки идёт третьим, чтобы важное было видно, не
 * вчитываясь в подписи.
 *
 * Обычная важность метки не получает: если пометить всё, не помечено ничего.
 */
export interface PriorityMark {
  /** Слово рядом с точкой. */
  label: string;
  /** Цвет точки. */
  dot: string;
  /** Левый край карточки. У «не горит» пустой: тихое не кричит. */
  edge: string;
}

const MARKS: Record<WorkTaskPriority, PriorityMark | null> = {
  urgent: {
    label: "Срочно",
    dot: "bg-magenta",
    edge: "border-l-2 border-l-magenta",
  },
  high: {
    label: "Важная",
    dot: "bg-gold",
    edge: "border-l-2 border-l-gold",
  },
  normal: null,
  low: {
    label: "Не горит",
    dot: "bg-text-2",
    edge: "",
  },
};

export function priorityMark(priority: WorkTaskPriority): PriorityMark | null {
  return MARKS[priority] ?? null;
}

/**
 * Слова для выбора важности: и в карточке, и в форме новой задачи. Один
 * список на оба места — «Важная» в одном окне и «Высокая» в соседнем читаются
 * как две разные настройки.
 *
 * Порядок — от спокойного к горящему: список открывают, чтобы поднять
 * важность, а не чтобы опустить.
 */
export const PRIORITY_TITLE: Record<WorkTaskPriority, string> = {
  low: "Не горит",
  normal: "Обычная",
  high: "Важная",
  urgent: "Срочно",
};
