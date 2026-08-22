"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Навигация внутри раздела «Люди» сервиса «Общение».
 *
 * Первая ссылка ведёт обратно к беседам: справочник — часть «Общения», и
 * попасть из него в переписку нужно за один шаг, а не через кнопку «назад».
 *
 * Сделана по образцу навигации Union, но своя: компоненты чужого сервиса
 * импортировать нельзя — см. docs/service-module-contract.md.
 */
const links = [
  { href: "/chat", label: "← Беседы" },
  { href: "/chat/people", label: "Справочник" },
  { href: "/chat/people/requests", label: "Мои запросы" },
  { href: "/chat/people/disclosures", label: "Кому открыт доступ" },
  { href: "/chat/people/profile", label: "Моя карточка" },
];

export function PeopleNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Навигация раздела «Люди»" className="mb-6 flex flex-wrap gap-2">
      {links.map((link) => {
        const active = pathname === link.href;
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? "page" : undefined}
            className={`rounded-xl border px-4 py-2 text-sm font-medium transition ${
              active
                ? "border-cyan/34 bg-cyan/10 text-text-0"
                : "glass border-glass-brd text-text-1 hover:border-cyan/30 hover:text-text-0"
            }`}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
