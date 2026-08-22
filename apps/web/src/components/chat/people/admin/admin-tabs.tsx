import Link from "next/link";
import { Tags, Users } from "lucide-react";

export type ContactsAdminTab = "tags" | "profiles";

const ITEMS: Array<{
  key: ContactsAdminTab;
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { key: "tags", href: "/admin/chat/people", label: "Теги", icon: Tags },
  {
    key: "profiles",
    href: "/admin/chat/people/profiles",
    label: "Карточки",
    icon: Users,
  },
];

/** Подшапка админки справочника. Активная вкладка задаётся явно. */
export function PeopleAdminTabs({ active }: { active: ContactsAdminTab }) {
  return (
    <nav
      className="mb-6 border-b border-glass-brd pb-3"
      aria-label="Разделы админки справочника"
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
