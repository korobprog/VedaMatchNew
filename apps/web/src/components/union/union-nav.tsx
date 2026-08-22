"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** Десктопная навигация Union. На телефоне её заменяет нижний UnionTabBar. */
const links = [
  { href: "/union/recommendations", label: "Знакомства" },
  { href: "/union/collections", label: "Подборки" },
  { href: "/union/likes", label: "Лайки" },
  { href: "/chat", label: "Чаты" },
  { href: "/union/connections", label: "Связи" },
  { href: "/union/profile", label: "Профиль" },
];

export function UnionNav({ incomingPending }: { incomingPending: number }) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Навигация Union"
      className="mb-6 hidden flex-wrap gap-2 md:flex"
    >
      {links.map((link) => {
        const active = pathname === link.href;
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? "page" : undefined}
            className={`flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium transition ${
              active
                ? "border-magenta/40 bg-magenta/10 text-text-0"
                : "glass border-glass-brd text-text-1 hover:border-magenta/30 hover:text-text-0"
            }`}
          >
            {link.label}
            {link.href === "/union/likes" && incomingPending > 0 && (
              <span
                aria-label={`Входящих заявок: ${incomingPending}`}
                className="rounded-full bg-magenta px-2 py-0.5 text-xs font-semibold text-white"
              >
                {incomingPending}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
