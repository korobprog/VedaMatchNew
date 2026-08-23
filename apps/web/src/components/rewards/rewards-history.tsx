import type { RewardsLedgerEntryDto } from "@vedamatch/shared";
import { LEDGER_TYPE_LABELS, formatLedgerAmount } from "@/lib/rewards-share";

const dateFormat = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

/**
 * История операций. Отменённое начисление остаётся в списке помеченным, а не
 * исчезает: человек помнит, что баллы были, и пропажа без следа читается как
 * сбой портала.
 */
export function RewardsHistory({ items }: { items: RewardsLedgerEntryDto[] }) {
  if (items.length === 0) return null;

  return (
    <section className="glass rounded-2xl border border-glass-brd p-6">
      <h2 className="mb-4 font-display text-lg font-semibold text-text-0">
        История
      </h2>
      <ul className="flex flex-col gap-3">
        {items.map((entry) => (
          <li
            key={entry.id}
            className="flex flex-wrap items-baseline justify-between gap-2 border-b border-glass-brd pb-3 last:border-0 last:pb-0"
          >
            <div className="min-w-0">
              <p className="font-body text-text-0">
                {LEDGER_TYPE_LABELS[entry.type]}
                {entry.revoked && (
                  <span className="ml-2 font-body text-sm text-text-1">
                    отменено
                  </span>
                )}
              </p>
              {entry.comment && (
                <p className="font-body text-sm text-text-1">{entry.comment}</p>
              )}
              <p className="font-body text-sm text-text-1">
                {dateFormat.format(new Date(entry.createdAt))}
              </p>
            </div>
            <p className="font-mono text-lg text-text-0">
              {formatLedgerAmount(entry.amount)}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
