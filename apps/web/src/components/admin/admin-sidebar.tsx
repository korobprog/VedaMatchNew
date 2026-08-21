"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { AdminNavGroup } from "@/lib/admin-nav";
import { isAdminNavItemActive } from "@/lib/admin-nav";
import { cn } from "@/lib/utils";

/**
 * Навигация админки. На широких экранах — колонка слева, на узких — лента чипов
 * над содержимым: вертикальный сайдбар на телефоне съедал бы весь первый экран.
 * Список приходит уже отфильтрованным по правам, здесь только отрисовка.
 */
export function AdminSidebar({ groups }: { groups: AdminNavGroup[] }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Разделы админки" className="lg:w-56 lg:shrink-0">
      <ul className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-2 lg:mx-0 lg:block lg:space-y-6 lg:overflow-visible lg:px-0 lg:pb-0">
        <li className="shrink-0 lg:block">
          <AdminNavLink
            href="/admin"
            label="Обзор"
            active={isAdminNavItemActive("/admin", pathname)}
          />
        </li>
        {groups.map((group) => (
          <li key={group.title} className="contents lg:block">
            <p className="hidden px-3 pb-1.5 font-display text-xs font-semibold uppercase tracking-wide text-text-2 lg:block">
              {group.title}
            </p>
            <ul className="contents lg:block lg:space-y-1">
              {group.items.map((item) => (
                <li key={item.href} className="shrink-0 lg:block">
                  <AdminNavLink
                    href={item.href}
                    label={item.label}
                    active={isAdminNavItemActive(item.href, pathname)}
                  />
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function AdminNavLink({
  href,
  label,
  active,
}: {
  href: string;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "block whitespace-nowrap rounded-xl border px-3 py-2 text-sm transition-colors lg:whitespace-normal",
        active
          ? "border-magenta/50 bg-glass font-medium text-text-0"
          : "border-glass-brd text-text-1 hover:border-magenta/40 hover:text-text-0",
      )}
    >
      {label}
    </Link>
  );
}
