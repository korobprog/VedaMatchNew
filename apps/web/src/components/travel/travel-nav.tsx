"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/travel", label: "Куда поехать" },
  { href: "/travel/bookings", label: "Мои заявки" },
  { href: "/travel/manage", label: "Моё жильё" },
];

export function TravelNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Разделы сервиса «Путешествия»" className="mb-6">
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
