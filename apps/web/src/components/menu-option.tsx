import type { ReactNode } from "react";
import { Check } from "lucide-react";

/**
 * Пункт выбора в меню-значках (VED-596): выбранный — с подсветкой, рамкой
 * и галочкой, чтобы текущий выбор, включая «для всех» и «все», был виден
 * внутри окна сразу, а не угадывался по оттенку фона. Для скринридера то же
 * передаёт `aria-pressed` у самой кнопки; галочка от чтения скрыта.
 */
export function menuOptionClass(pressed: boolean): string {
  return `flex min-h-11 w-full items-center gap-2 rounded-xl px-3 text-left text-sm transition-colors disabled:opacity-50 ${
    pressed
      ? "bg-magenta/10 font-semibold text-text-0 ring-1 ring-inset ring-magenta/50"
      : "text-text-1 hover:bg-bg-1 hover:text-text-0"
  }`;
}

/** Подпись пункта и галочка у выбранного. */
export function MenuOptionLabel({
  pressed,
  children,
}: {
  pressed: boolean;
  children: ReactNode;
}) {
  return (
    <>
      <span className="min-w-0 flex-1">{children}</span>
      {pressed && (
        <Check aria-hidden className="size-4 shrink-0 text-magenta" />
      )}
    </>
  );
}
