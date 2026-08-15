import Link from "next/link";

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

/** Подшапка сервиса. Активный пункт задаётся явно, а не выводится из пути:
 *  вложенные страницы (раздел, витрина, заявка) иначе гасили бы свой раздел. */
export function MarketNav({
  active,
  labels,
}: {
  active: MarketNavKey;
  labels: Record<MarketNavKey, string>;
}) {
  const items: Array<{ key: MarketNavKey; href: string }> = [
    { key: "catalog", href: "/market" },
    { key: "shops", href: "/market/shops" },
    { key: "favorites", href: "/market/favorites" },
    { key: "cart", href: "/market/cart" },
    { key: "orders", href: "/market/orders" },
    { key: "chats", href: "/market/chats" },
    { key: "subscriptions", href: "/market/subscriptions" },
    { key: "sell", href: "/market/sell" },
    { key: "rules", href: "/market/rules" },
  ];

  return (
    <nav className="mb-6 -mx-4 overflow-x-auto px-4">
      <ul className="flex w-max gap-1 border-b border-glass-brd">
        {items.map((item) => {
          const isActive = item.key === active;
          return (
            <li key={item.key}>
              <Link
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className={[
                  "-mb-px inline-block whitespace-nowrap border-b-2 px-3 py-2 text-sm transition-colors",
                  isActive
                    ? "border-magenta text-text-0"
                    : "border-transparent text-text-2 hover:text-text-0",
                ].join(" ")}
              >
                {labels[item.key]}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
