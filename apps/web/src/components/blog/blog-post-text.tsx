"use client";

import { useId, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { buildBlogTextPreview } from "./blog-text-preview";

/**
 * Текст поста в ленте: начало и кнопка «Далее» (VED-371).
 *
 * Пост теперь бывает длинным (20000 знаков), и развёрнутый целиком он
 * занимает экран целиком: до второго поста надо прокручивать. Поэтому в
 * ленте видно начало, а полный текст раскрывается нажатием — по просьбе
 * заказчика кнопкой-надписью «Далее» во всю ширину карточки, а не ссылкой в
 * конце абзаца, которую на телефоне надо ловить пальцем.
 *
 * Свёрнутый текст не спрятан в разметке, а не отрисован вовсе: `line-clamp`
 * оставил бы в карточке весь текст, а лента на телефоне из нескольких
 * длинных постов — это лишняя работа для верстки на каждой прокрутке.
 */
export function BlogPostText({
  text,
  className,
}: {
  text: string;
  /** Отступы задаёт карточка: в репосте текст лежит в своей рамке. */
  className?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const bodyId = useId();
  if (text === "") return null;

  const preview = buildBlogTextPreview(text);
  const shown = expanded || !preview.truncated ? text : preview.text;

  return (
    <div className={className}>
      <p
        id={bodyId}
        className="whitespace-pre-line text-sm leading-6 text-text-1"
      >
        {shown}
      </p>
      {preview.truncated && (
        <button
          type="button"
          onClick={() => setExpanded((current) => !current)}
          aria-expanded={expanded}
          aria-controls={bodyId}
          /* Во всю ширину и 48px высотой: «достаточно крупная
             кнопка-надпись» из VED-371. Подпись 16px — её читают, а не
             угадывают по стрелке. */
          className="mt-2 flex min-h-12 w-full items-center justify-center gap-1.5 rounded-xl border border-glass-brd bg-bg-1 text-base font-semibold text-text-0 hover:border-cyan/60"
        >
          {expanded ? (
            <ChevronUp aria-hidden className="size-4" />
          ) : (
            <ChevronDown aria-hidden className="size-4" />
          )}
          {expanded ? "Свернуть" : "Далее"}
        </button>
      )}
    </div>
  );
}
