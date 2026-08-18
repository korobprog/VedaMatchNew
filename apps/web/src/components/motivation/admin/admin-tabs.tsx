import Link from "next/link";
import { FolderTree, ListChecks, PenLine, PlusCircle, Radar, SlidersHorizontal } from "lucide-react";

export type MotivationAdminTab =
  | "queue"
  | "create"
  | "add"
  | "search"
  | "categories"
  | "settings";

const ITEMS: Array<{
  key: MotivationAdminTab;
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { key: "queue", href: "/admin/motivation/queue", label: "Очередь", icon: ListChecks },
  // Два разных пути: «Своя» — текст пишет админ, «Цитата» — текст пишет ИИ.
  { key: "create", href: "/admin/motivation/create", label: "Своя", icon: PenLine },
  { key: "add", href: "/admin/motivation/add", label: "Цитата", icon: PlusCircle },
  { key: "search", href: "/admin/motivation/search", label: "Поиск", icon: Radar },
  { key: "categories", href: "/admin/motivation/categories", label: "Категории", icon: FolderTree },
  { key: "settings", href: "/admin/motivation/settings", label: "Настройки", icon: SlidersHorizontal },
];

/**
 * Подшапка админки. Перенос строк вместо горизонтальной ленты — до четвёртой
 * вкладки на телефоне иначе нужно догадаться доскроллить.
 *
 * Активная вкладка задаётся явно, а не выводится из пути: так вложенные экраны
 * не гасят свой раздел.
 */
export function MotivationAdminTabs({
  active,
  queueCount,
}: {
  active: MotivationAdminTab;
  queueCount?: number;
}) {
  return (
    <nav className="mb-6 border-b border-glass-brd pb-3" aria-label="Разделы админки Motivation">
      <ul className="flex flex-wrap gap-1 sm:gap-1.5">
        {ITEMS.map((item) => {
          const isActive = item.key === active;
          const Icon = item.icon;
          return (
            <li key={item.key}>
              <Link
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className={[
                  "inline-flex items-center gap-1.5 rounded-xl border font-semibold transition-colors",
                  "px-2.5 py-2 text-xs sm:px-3 sm:text-sm",
                  isActive
                    ? "border-cyan/40 bg-cyan/10 text-cyan"
                    : "border-transparent text-text-2 hover:bg-glass-brd/30 hover:text-text-0",
                ].join(" ")}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {item.label}
                {item.key === "queue" && queueCount ? (
                  <span className="rounded-full bg-gold/20 px-1.5 text-[11px] font-bold text-gold">
                    {queueCount}
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
