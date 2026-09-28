import type { MotivationVideoCategoryDto } from "@vedamatch/shared";
import { reelsHref } from "./feed-style";

/**
 * Поведение ленты «Видео» (VED-246) без DOM: что делает касание, когда ролик
 * запускается сам, какие папки показать строкой над лентой.
 */

export type VideoTapAction = "play" | "unmute" | "pause";

/**
 * Касание ролика. Ролик сам стартует без звука — браузер иначе автоплей не
 * даст, — поэтому первое касание включает звук, а не ставит паузу: иначе,
 * чтобы услышать, пришлось бы нажать дважды. Со звуком касание — пауза.
 * Стоящий ролик (пауза или `prefers-reduced-motion`, где он сам не стартует)
 * касание запускает сразу со звуком: человек сам попросил его посмотреть.
 */
export function videoTapAction({
  paused,
  muted,
}: {
  paused: boolean;
  muted: boolean;
}): VideoTapAction {
  if (paused) return "play";
  return muted ? "unmute" : "pause";
}

/**
 * Запускать ли ролик самому. Только на экране, только в открытой вкладке и
 * только если человек не просил меньше движения.
 */
export function shouldAutoplay({
  active,
  reducedMotion,
  visible,
}: {
  active: boolean;
  reducedMotion: boolean;
  visible: boolean;
}): boolean {
  return active && visible && !reducedMotion;
}

/** Подпись кнопки-ролика для скринридера — что сделает нажатие. */
export function videoTapLabel(action: VideoTapAction, title: string): string {
  const name = title.trim() ? `«${title.trim()}»` : "ролик";
  if (action === "play") return `Смотреть ${name} со звуком`;
  if (action === "unmute") return `Включить звук: ${name}`;
  return `Пауза: ${name}`;
}

export type VideoCategoryChip = {
  slug: string | null;
  title: string;
  href: string;
  current: boolean;
  /** Подпапка — рисуется после своей верхней. */
  nested: boolean;
};

/**
 * Строка папок над лентой — как фильтр по категории у афоризмов, но из меню
 * роликов: только папки, где ролики есть. Первой — «Все». Порядок —
 * как пришёл (обход дерева: верхняя, за ней её подпапки).
 */
export function videoCategoryChips(
  categories: readonly MotivationVideoCategoryDto[],
  current: string | undefined,
): VideoCategoryChip[] {
  const known = categories.some((category) => category.slug === current);
  return [
    {
      slug: null,
      title: "Все",
      href: reelsHref({ tab: "video" }),
      // Папка из адреса, которой нет в меню (пустая), — «Все» не горит, но
      // и выбранной кнопки нет: лента честно покажет «пока пусто».
      current: !current,
      nested: false,
    },
    ...categories.map((category) => ({
      slug: category.slug,
      title: category.title,
      href: reelsHref({ tab: "video", category: category.slug }),
      current: known && category.slug === current,
      nested: Boolean(category.parentId),
    })),
  ];
}

/** Добавить страницу без повторов: ролик на стыке страниц не удваивается. */
export function appendVideos<T extends { id: string }>(
  current: readonly T[],
  next: readonly T[],
): T[] {
  const ids = new Set(current.map((item) => item.id));
  return [...current, ...next.filter((item) => !ids.has(item.id))];
}
