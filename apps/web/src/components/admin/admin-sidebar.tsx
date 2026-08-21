"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { ChevronDown } from "lucide-react";
import type { AdminNavGroup } from "@/lib/admin-nav";
import { currentAdminNavLabel, isAdminNavItemActive } from "@/lib/admin-nav";
import { cn } from "@/lib/utils";

/**
 * Навигация админки. На широких экранах — колонка слева, на узких — кнопка
 * с названием текущего раздела и выпадающий список под ней.
 *
 * Ленты чипов здесь была раньше, и на телефоне она не работала: восемнадцать
 * разделов давали два метра горизонтальной прокрутки вслепую, без групп и без
 * понимания, где ты находишься. Список открывается поверх содержимого и
 * закрывается выбором — до последнего пункта столько же движений, сколько до
 * первого.
 *
 * Список приходит уже отфильтрованным по правам, здесь только отрисовка.
 */
export function AdminSidebar({ groups }: { groups: AdminNavGroup[] }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const current = currentAdminNavLabel(groups, pathname);

  return (
    <nav
      aria-label="Разделы админки"
      // Липкая под шапкой: разделы вроде справочника тянутся на пять тысяч
      // точек, и ради смены раздела мотать всё обратно вверх — наказание.
      className="sticky top-14 z-30 lg:static lg:w-56 lg:shrink-0"
      onKeyDown={(event) => {
        if (event.key === "Escape") setOpen(false);
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls="admin-nav-sections"
        // Фон непрозрачный, а не стеклянный: кнопка липнет над содержимым,
        // и в тёмной теме стекло — это 6% белого, сквозь которое читается
        // текст страницы.
        className="flex w-full items-center justify-between gap-3 rounded-xl border border-glass-brd bg-bg-1 px-4 py-3 text-left text-sm text-text-0 shadow-lg lg:hidden"
      >
        <span className="min-w-0 truncate">
          <span className="text-text-2">Раздел: </span>
          <span className="font-medium">{current}</span>
        </span>
        <ChevronDown
          aria-hidden="true"
          className={cn(
            "h-4 w-4 shrink-0 text-text-2 transition-transform",
            open && "rotate-180",
          )}
        />
      </button>

      <div
        id="admin-nav-sections"
        className={cn(
          // Список ложится поверх содержимого, а не раздвигает его, и
          // прокручивается сам: восемнадцать пунктов выше экрана телефона.
          "absolute inset-x-0 top-full mt-2 max-h-[70vh] space-y-4 overflow-y-auto rounded-2xl border border-glass-brd bg-bg-1 p-2 shadow-2xl",
          // На широком экране это обычная колонка: ни рамки, ни стекла, ни
          // скрытия — там ничего не разворачивают.
          "lg:static lg:mt-0 lg:block lg:max-h-none lg:space-y-6 lg:overflow-visible lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none",
          open ? "block" : "hidden",
        )}
      >
        <AdminNavLink
          href="/admin"
          label="Обзор"
          active={isAdminNavItemActive("/admin", pathname)}
          onNavigate={() => setOpen(false)}
        />
        {groups.map((group) => (
          <div key={group.title}>
            {/* На панели фон светлее страницы, и на нём `--vm-text-2` даёт
                4.29:1 при 12px — ниже порога. В колонке на широком экране
                подпись лежит на фоне страницы и остаётся приглушённой. */}
            <p className="px-3 pb-1.5 font-display text-xs font-semibold uppercase tracking-wide text-text-1 lg:text-text-2">
              {group.title}
            </p>
            <ul className="space-y-1">
              {group.items.map((item) => (
                <li key={item.href}>
                  <AdminNavLink
                    href={item.href}
                    label={item.label}
                    active={isAdminNavItemActive(item.href, pathname)}
                    onNavigate={() => setOpen(false)}
                  />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </nav>
  );
}

function AdminNavLink({
  href,
  label,
  active,
  onNavigate,
}: {
  href: string;
  label: string;
  active: boolean;
  onNavigate: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        // min-h-11 — палец, а не курсор: на телефоне пункты меню идут подряд,
        // и промахиваться по соседнему разделу человек не должен.
        "flex min-h-11 items-center rounded-xl border px-3 py-2 text-sm transition-colors lg:min-h-0",
        active
          ? "border-magenta/50 bg-glass font-medium text-text-0"
          : "border-transparent text-text-1 hover:border-magenta/40 hover:text-text-0 lg:border-glass-brd",
      )}
    >
      {label}
    </Link>
  );
}
