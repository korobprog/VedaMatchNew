import Link from "next/link";
import type { MarketOrderDto } from "@vedamatch/shared";
import type { Locale } from "@/lib/locale";
import { formatPriceMinor } from "./price";

/** Цвет статуса: закрытые заявки не должны выглядеть так же, как живые. */
function statusClass(status: MarketOrderDto["status"]): string {
  if (status === "completed") return "border-cyan/40 text-cyan";
  if (status === "declined_by_seller" || status === "cancelled_by_buyer") {
    return "border-glass-brd text-text-2";
  }
  return "border-gold/40 text-gold";
}

export function OrderCard({
  order,
  locale,
  labels,
}: {
  order: MarketOrderDto;
  locale: Locale;
  labels: { number: string; createdAt: string; total: string; status: string };
}) {
  return (
    <Link
      href={`/market/orders/${order.id}`}
      className="glass block rounded-2xl border border-glass-brd p-4 transition-colors hover:border-magenta/40"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-medium text-text-0">
          {labels.number.replace("{number}", String(order.number))}
        </span>
        <span
          className={`rounded-full border px-2 py-0.5 text-xs ${statusClass(order.status)}`}
        >
          {labels.status}
        </span>
        <span className="text-xs text-text-2">
          {labels.createdAt.replace(
            "{date}",
            new Date(order.createdAt).toLocaleDateString(locale),
          )}
        </span>
      </div>

      <p className="mt-2 truncate text-sm text-text-1">
        {order.shop.name} ·{" "}
        {order.items.map((item) => item.titleSnapshot).join(", ")}
      </p>

      <p className="mt-1 text-sm text-text-2">
        {labels.total}:{" "}
        <span className="font-display font-semibold text-text-0">
          {formatPriceMinor(order.totalMinor, order.currency)}
        </span>
      </p>
    </Link>
  );
}
