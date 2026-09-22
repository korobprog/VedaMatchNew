"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Newspaper } from "lucide-react";
import {
  BLOG_HOME_COOKIE,
  BLOG_HOME_COOKIE_MAX_AGE,
  serializeBlogHomeVisible,
} from "@/lib/blog-home-visibility";

/**
 * Вернуть блог-ленту на главную (VED-238).
 *
 * Стоит в строке настроек над сеткой сервисов, рядом с «Кнопки» и «Изменить
 * порядок», и показывается только когда лента спрятана: в спрятанном виде
 * главная обязана выглядеть как раньше, а прежде этой строки настроек
 * наверху не было вовсе — значит, единственное место, куда можно положить
 * возврат, не меняя верх экрана, это она.
 *
 * Подпись — одно слово «Лента» (VED-322): «Вернуть ленту» на узком экране
 * ломалось пополам и вылезало из ряда настроек. Куда именно вернуть,
 * договаривает подсказка при наведении.
 */
export function BlogFeedToggle({
  userId,
  hidden,
}: {
  userId: string;
  hidden: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  if (!hidden) return null;

  function show() {
    document.cookie = `${BLOG_HOME_COOKIE}=${serializeBlogHomeVisible(
      userId,
      true,
    )}; path=/; max-age=${BLOG_HOME_COOKIE_MAX_AGE}; samesite=lax`;
    startTransition(() => router.refresh());
  }

  return (
    <button
      type="button"
      onClick={show}
      disabled={pending}
      /* Полная подпись — подсказкой: имя кнопки на экране остаётся коротким,
         а «куда вернуть» видно при наведении. Доступное имя при этом берётся
         из текста, а не из title, — они не расходятся. */
      title="Вернуть ленту на главную"
      /* Рамка и отступы — как у соседних кнопок строки настроек, высоту
         поэтому не наращиваем: в одном ряду с ними кнопка на 44px читается
         как чужая. `whitespace-nowrap` — та же защита от переноса, что у
         «Изменить порядок»: с ним подпись не ломается пополам даже там, где
         ряд уезжает в горизонтальную прокрутку (VED-322). */
      className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-glass-brd px-2.5 py-1.5 text-xs text-text-1 hover:border-cyan/60 disabled:opacity-60"
    >
      <Newspaper aria-hidden className="size-3.5" />
      Лента
    </button>
  );
}
