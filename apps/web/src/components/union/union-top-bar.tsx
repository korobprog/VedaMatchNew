import Link from "next/link";
import { SlidersHorizontal } from "lucide-react";

/**
 * Заголовок раздела знакомств для мобильных: название экрана слева и кнопка
 * настроек справа, которая ведёт в редактирование анкеты. На десктопе разделы
 * подписаны обычным заголовком страницы, поэтому бар скрыт.
 */
export function UnionTopBar({
  title,
  aside,
}: {
  title: string;
  /** Рядом с кнопкой настроек — например, «Найдено: 28» (VED-652). */
  aside?: React.ReactNode;
}) {
  return (
    <div className="mb-3 flex items-center gap-3 md:hidden">
      <h1 className="font-display text-xl font-bold text-text-0">{title}</h1>
      <span className="ml-auto text-sm text-text-2">{aside}</span>
      <Link
        href="/union/profile"
        aria-label="Настройки анкеты"
        className="flex h-10 w-10 items-center justify-center rounded-xl glass border border-glass-brd text-text-1 transition hover:text-text-0"
      >
        <SlidersHorizontal size={20} aria-hidden />
      </Link>
    </div>
  );
}
