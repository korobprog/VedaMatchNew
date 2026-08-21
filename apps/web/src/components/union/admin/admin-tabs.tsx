import Link from "next/link";
import { BarChart3, Users } from "lucide-react";

export type UnionAdminTab = "stats" | "profiles";

const ITEMS: Array<{
  key: UnionAdminTab;
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { key: "stats", href: "/admin/union", label: "Сводка", icon: BarChart3 },
  { key: "profiles", href: "/admin/union/profiles", label: "Анкеты", icon: Users },
];

/** Подшапка админки знакомств. Активная вкладка задаётся явно, как в Motivation. */
export function UnionAdminTabs({ active }: { active: UnionAdminTab }) {
  return (
    <nav
      className="mb-6 border-b border-glass-brd pb-3"
      aria-label="Разделы админки знакомств"
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
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
