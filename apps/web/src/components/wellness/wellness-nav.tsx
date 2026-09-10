"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** Разделы сервиса. Все на месте: заделов больше не осталось. */
const LINKS = [
  { href: "/wellness", label: "Обзор" },
  { href: "/wellness/scan", label: "Проверить" },
  { href: "/wellness/basket", label: "Корзина" },
  { href: "/wellness/recipes", label: "Рецепты" },
  { href: "/wellness/diet", label: "Мои ограничения" },
  { href: "/wellness/history", label: "История" },
];

export function WellnessNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Разделы сервиса «Здоровье»" className="mb-6">
      <ul className="flex flex-wrap gap-2">
        {LINKS.map((link) => {
          const active = pathname === link.href;
          return (
            <li key={link.href}>
              <Link
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={`inline-block rounded-xl border px-3 py-2 text-sm ${
                  active
                    ? "border-magenta text-text-0"
                    : "border-glass-brd text-text-1"
                }`}
              >
                {link.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
