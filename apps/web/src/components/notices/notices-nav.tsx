"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Навигация внутри доски. Сделана по образцу навигации Контактов, но своя:
 * компоненты чужого сервиса импортировать нельзя — см.
 * docs/service-module-contract.md.
 */
const links = [
  { href: "/notices", label: "Доска" },
  { href: "/notices/events", label: "Афиша" },
  { href: "/notices/map", label: "Карта" },
  { href: "/notices/my", label: "Мои объявления" },
  { href: "/notices/responses", label: "Мои отклики" },
  { href: "/notices/subscriptions", label: "Подписки" },
  { href: "/notices/new", label: "Написать" },
  { href: "/notices/rules", label: "Правила" },
];

export function NoticesNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Навигация Объявлений" className="mb-6 flex flex-wrap gap-2">
      {links.map((link) => {
        const active = pathname === link.href;
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? "page" : undefined}
            className={`rounded-xl border px-4 py-2 text-sm font-medium transition ${
              active
                ? "border-magenta/40 bg-magenta/10 text-text-0"
                : "glass border-glass-brd text-text-1 hover:border-magenta/30 hover:text-text-0"
            }`}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
