"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Навигация внутри справочника «Контакты».
 *
 * Сделана по образцу навигации Union, но своя: компоненты чужого сервиса
 * импортировать нельзя — см. docs/service-module-contract.md.
 */
const links = [
  { href: "/contacts", label: "Справочник" },
  { href: "/contacts/requests", label: "Мои запросы" },
  { href: "/contacts/disclosures", label: "Кому открыт доступ" },
  { href: "/contacts/profile", label: "Моя карточка" },
];

export function ContactsNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Навигация Контактов" className="mb-6 flex flex-wrap gap-2">
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
