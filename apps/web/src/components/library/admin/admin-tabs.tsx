import Link from "next/link";
import { FolderTree, Link2 } from "lucide-react";

export type LibraryAdminTab = "categories" | "entries";

const ITEMS: Array<{
  key: LibraryAdminTab;
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  {
    key: "categories",
    href: "/admin/library",
    label: "Категории",
    icon: FolderTree,
  },
  {
    key: "entries",
    href: "/admin/library/entries",
    label: "Записи",
    icon: Link2,
  },
];

/** Подшапка админки Образования. Активная вкладка задаётся явно. */
export function LibraryAdminTabs({
  active,
  duplicates,
}: {
  active: LibraryAdminTab;
  duplicates?: number;
}) {
  return (
    <nav
      className="mb-6 border-b border-glass-brd pb-3"
      aria-label="Разделы админки Образования"
    >
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
                {item.key === "categories" && duplicates ? (
                  <span className="rounded-full bg-gold/20 px-1.5 text-[11px] font-bold text-gold">
                    {duplicates}
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
