"use client";

import { useId, useLayoutEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { buildBlogTextPreview, type BlogTextPreview } from "./blog-text-preview";

/**
 * Текст поста в ленте: начало и кнопка «Далее» (VED-371).
 *
 * Пост теперь бывает длинным (20000 знаков), и развёрнутый целиком он
 * занимает экран целиком: до второго поста надо прокручивать. Поэтому в
 * ленте видно начало, а полный текст раскрывается нажатием — по просьбе
 * заказчика крупной кнопкой-надписью «Далее», а не ссылкой в конце абзаца,
 * которую на телефоне надо ловить пальцем.
 *
 * Состояние свёртки вынесено в `useBlogTextFold`, а кнопка — в отдельный
 * `BlogMoreButton`: карточка ставит «Далее» в ряд действий под постом, а не
 * отдельной строкой. Отдельная строка в 56px на каждую карточку — это ровно
 * та высота, которой не хватало, чтобы на экране 375×812 помещались три
 * поста.
 *
 * Свёрнутый текст ограничен дважды. `buildBlogTextPreview` отрезает начало
 * заранее, при SSR тоже, — так карточка знает, что разворачивать есть что, и
 * длинный текст не попадает в разметку целиком. А `line-clamp-3` держит
 * высоту: абзац в 120 знаков на узком экране всё равно может лечь в четыре
 * строки. Если после этого текст не влез, это видно по `scrollHeight`, и
 * «Далее» появляется и тогда, — иначе обрезанный CSS хвост было бы не
 * достать.
 *
 * Заголовок в свёрнутом виде — не длиннее двух строк (`line-clamp-2`), и
 * по той же причине: заголовок до 120 знаков шрифтом Unbounded на телефоне
 * ложится в пять строк, и тогда третий пост на экран уже не помещается.
 * Обрезанный заголовок тоже разворачивается «Далее», а скринридер читает
 * его целиком и в свёрнутом виде — обрезка здесь только визуальная.
 */

export interface BlogTextFold {
  text: string;
  preview: BlogTextPreview;
  expanded: boolean;
  /** Есть ли что разворачивать: `false` — кнопки «Далее» быть не должно. */
  canExpand: boolean;
  toggle: () => void;
  bodyId: string;
  /** Есть ли у поста заголовок, который сворачивается вместе с текстом. */
  hasTitle: boolean;
  titleId: string;
  /** Классы заголовка: две строки в свёрнутом виде, целиком в развёрнутом. */
  titleClassName: string;
}

type Attach = (node: HTMLParagraphElement | null) => void;

/**
 * Свёртка и два колбэк-ref для замера — отдельно от неё. Не внутри объекта
 * свёртки: React Compiler считает объект, из которого взяли ref, самим ref и
 * запрещает читать из него при рендере, а `fold` читается при рендере весь.
 */
export function useBlogTextFold(
  text: string,
  title: string | null = null,
): { fold: BlogTextFold; attachBody: Attach; attachTitle: Attach } {
  const [expanded, setExpanded] = useState(false);
  const [clipped, setClipped] = useState(false);
  const bodyId = useId();
  const titleId = useId();
  const [bodyNode, attachBody] = useState<HTMLParagraphElement | null>(null);
  const [titleNode, attachTitle] = useState<HTMLParagraphElement | null>(null);
  const preview = useMemo(() => buildBlogTextPreview(text), [text]);

  useLayoutEffect(() => {
    // Мерить можно только свёрнутый вид: развёрнутый не обрезан по
    // определению, и последнее измерение остаётся в силе.
    if (expanded) return;
    const nodes = [bodyNode, titleNode].filter(
      (node): node is HTMLParagraphElement => node !== null,
    );
    if (nodes.length === 0) return;
    const measure = () =>
      setClipped(
        nodes.some((node) => node.scrollHeight > node.clientHeight + 1),
      );
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    nodes.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, [expanded, text, title, bodyNode, titleNode]);

  return {
    fold: {
      text,
      preview,
      expanded,
      canExpand: preview.truncated || clipped,
      toggle: () => setExpanded((current) => !current),
      bodyId,
      hasTitle: Boolean(title),
      titleId,
      titleClassName: expanded ? "" : "line-clamp-2",
    },
    attachBody,
    attachTitle,
  };
}

export function BlogPostText({
  fold,
  attach,
  className,
}: {
  fold: BlogTextFold;
  /** `attachBody` из `useBlogTextFold` — для замера обрезки. */
  attach: Attach;
  /** Отступы задаёт карточка: в репосте текст лежит в своей рамке. */
  className?: string;
}) {
  if (fold.text === "") return null;
  const shown =
    fold.expanded || !fold.preview.truncated ? fold.text : fold.preview.text;

  return (
    <p
      id={fold.bodyId}
      ref={attach}
      className={`whitespace-pre-line text-sm leading-6 text-text-1 ${
        fold.expanded ? "" : "line-clamp-3"
      } ${className ?? ""}`}
    >
      {shown}
    </p>
  );
}

/**
 * «Далее» / «Свернуть». Подпись 16px и полужирная, высота 48px: это
 * «достаточно крупная кнопка-надпись» из VED-371 — её читают, а не угадывают
 * по стрелке, и попадают пальцем с первого раза.
 */
export function BlogMoreButton({
  fold,
  className,
}: {
  fold: BlogTextFold;
  className?: string;
}) {
  if (!fold.canExpand) return null;
  // Ссылаться можно только на то, что есть в разметке: у поста бывает
  // заголовок без текста и текст без заголовка.
  const controls = [fold.hasTitle && fold.titleId, fold.text && fold.bodyId]
    .filter(Boolean)
    .join(" ");
  return (
    <button
      type="button"
      onClick={fold.toggle}
      aria-expanded={fold.expanded}
      aria-controls={controls || undefined}
      className={`inline-flex min-h-12 items-center justify-center gap-1.5 rounded-xl border border-glass-brd bg-bg-1 px-4 text-base font-semibold text-text-0 hover:border-cyan/60 ${
        className ?? ""
      }`}
    >
      {fold.expanded ? (
        <ChevronUp aria-hidden className="size-4" />
      ) : (
        <ChevronDown aria-hidden className="size-4" />
      )}
      {fold.expanded ? "Свернуть" : "Далее"}
    </button>
  );
}
