import Link from "next/link";
import {
  BookMarked,
  Bell,
  Heart,
  LayoutGrid,
  MessageSquare,
  Receipt,
  ScrollText,
  ShoppingBasket,
  Store,
} from "lucide-react";

export type MarketNavKey =
  | "catalog"
  | "shops"
  | "favorites"
  | "cart"
  | "orders"
  | "chats"
  | "subscriptions"
  | "sell"
  | "rules";

const ITEMS: Array<{
  key: MarketNavKey;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { key: "catalog", href: "/market", icon: LayoutGrid },
  { key: "shops", href: "/market/shops", icon: Store },
  { key: "favorites", href: "/market/favorites", icon: Heart },
  { key: "cart", href: "/market/cart", icon: ShoppingBasket },
  { key: "orders", href: "/market/orders", icon: Receipt },
  { key: "chats", href: "/market/chats", icon: MessageSquare },
  { key: "subscriptions", href: "/market/subscriptions", icon: Bell },
  { key: "sell", href: "/market/sell", icon: BookMarked },
  { key: "rules", href: "/market/rules", icon: ScrollText },
];

/**
 * Подшапка сервиса.
 *
 * Девять пунктов в горизонтальной прокрутке на телефоне означали, что до
 * «Правил» и «Моего магазина» нужно догадаться доскроллить. Здесь перенос
 * строк вместо ленты.
 *
 * Подписи оставлены и на мобильном: девять иконок без слов — это угадайка,
 * а тултипа на телефоне нет. Вместо этого ужат сам чип — мелкий кегль и
 * узкие поля, — и три строки читаемых подписей выходят дешевле двух строк
 * непонятных значков.
 *
 * Активный пункт задаётся явно, а не выводится из пути: вложенные страницы
 * (раздел, витрина, заявка) иначе гасили бы свой раздел навигации.
 */
export function MarketNav({
  active,
  labels,
}: {
  active: MarketNavKey;
  labels: Record<MarketNavKey, string>;
}) {
  return (
    <nav className="mb-6 border-b border-glass-brd pb-3">
      <ul className="flex flex-wrap gap-1 sm:gap-1.5">
        {ITEMS.map((item) => {
          const isActive = item.key === active;
          const Icon = item.icon;
          const label = labels[item.key];
          return (
            <li key={item.key}>
              <Link
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                aria-label={label}
                title={label}
                className={[
                  "inline-flex items-center gap-1 rounded-xl border font-semibold transition-colors",
                  // Ужатый чип на телефоне, обычная вкладка с sm.
                  "px-2 py-1.5 text-xs sm:gap-1.5 sm:px-3 sm:py-2 sm:text-sm",
                  isActive
                    ? "border-cyan/40 bg-cyan/10 text-cyan"
                    : "border-transparent text-text-2 hover:bg-glass-brd/30 hover:text-text-0",
                ].join(" ")}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
