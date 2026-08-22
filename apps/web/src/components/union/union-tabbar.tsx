"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type TabKey = "profiles" | "collections" | "likes" | "chats" | "account";

const tabs: { key: TabKey; href: string; label: string }[] = [
  { key: "profiles", href: "/union/recommendations", label: "Анкеты" },
  { key: "collections", href: "/union/collections", label: "Подборки" },
  { key: "likes", href: "/union/likes", label: "Лайки" },
  { key: "chats", href: "/chat", label: "Чаты" },
  { key: "account", href: "/union/profile", label: "Профиль" },
];

/**
 * Нижняя навигация Union в стиле мобильных приложений знакомств. На десктопе
 * скрыта — там остаётся горизонтальный UnionNav. Точка на «Чатах» появится,
 * когда у сообщений будет признак прочтения (см. docs/union-dating-features.md).
 */
export function UnionTabBar({
  incomingPending = 0,
  hasUnreadChats = false,
}: {
  incomingPending?: number;
  hasUnreadChats?: boolean;
}) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Разделы знакомств"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-glass-brd bg-bg-0/85 backdrop-blur-xl md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="mx-auto flex max-w-md items-stretch">
        {tabs.map((tab) => {
          const active = pathname.startsWith(tab.href);
          return (
            <li key={tab.key} className="flex-1">
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={`flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition ${
                  active ? "text-magenta" : "text-text-2 hover:text-text-1"
                }`}
              >
                <span className="relative">
                  <TabIcon tab={tab.key} active={active} />
                  {tab.key === "likes" && incomingPending > 0 && (
                    <span
                      aria-label={`Новых лайков: ${incomingPending}`}
                      className="absolute -right-2.5 -top-1.5 min-w-[18px] rounded-full bg-magenta px-1 text-center text-[10px] font-bold leading-[18px] text-white"
                    >
                      {incomingPending > 99 ? "99+" : incomingPending}
                    </span>
                  )}
                  {tab.key === "chats" && hasUnreadChats && (
                    <span
                      aria-label="Есть непрочитанные сообщения"
                      className="absolute -right-1 -top-0.5 h-2 w-2 rounded-full bg-magenta"
                    />
                  )}
                </span>
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function TabIcon({ tab, active }: { tab: TabKey; active: boolean }) {
  const common = {
    width: 24,
    height: 24,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: active ? 2 : 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  switch (tab) {
    case "profiles":
      return (
        <svg {...common}>
          <rect x="3" y="4" width="11" height="16" rx="2.5" />
          <path d="M17 6.5l2.6.9a2 2 0 011.2 2.6l-3.4 9.4" />
        </svg>
      );
    case "collections":
      return (
        <svg {...common}>
          <rect x="3" y="4" width="12" height="14" rx="2.5" />
          <circle cx="16.5" cy="15.5" r="4" />
          <path d="M19.5 18.5L22 21" />
        </svg>
      );
    case "likes":
      return (
        <svg {...common}>
          <path d="M12 20s-7.2-4.6-7.2-9.4A4.1 4.1 0 0112 8.2a4.1 4.1 0 017.2 2.4C19.2 15.4 12 20 12 20z" />
        </svg>
      );
    case "chats":
      return (
        <svg {...common}>
          <path d="M20.5 12c0 4.1-3.8 7.4-8.5 7.4-1 0-2-.15-2.9-.43L4 20.5l1.7-3.6A7 7 0 013.5 12c0-4.1 3.8-7.4 8.5-7.4s8.5 3.3 8.5 7.4z" />
        </svg>
      );
    case "account":
      return (
        <svg {...common}>
          <circle cx="12" cy="8.5" r="3.7" />
          <path d="M4.8 20a7.2 7.2 0 0114.4 0" />
        </svg>
      );
  }
}
