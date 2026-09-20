import Link from "next/link";
import { isRequisiteFilled, splitBanks } from "@/lib/donate";
import { DONATE_BANKS, type DonateBank } from "@/lib/donate-content";
import { CopyField } from "./copy-field";

/**
 * «Наши банки» (VED-12). Список и значения — из `lib/donate-content.ts`,
 * единственного места, где их правят.
 *
 * Пока реквизита нет, на его месте стоит «уточняется», а не пример: человек,
 * переведший деньги по выдуманному счёту, потеряет их, и никакая пометка
 * «образец» этого не отменит.
 */
export function BankRequisites() {
  const { filled, pending } = splitBanks(DONATE_BANKS);

  return (
    <div className="space-y-4">
      {filled.length === 0 && (
        <p className="glass rounded-2xl border border-gold/40 p-4 text-sm text-text-1">
          Реквизиты банков мы дописываем — здесь появятся счёт, БИК и получатель.
          Пока перевести можно быстрым способом выше, а если его тоже нет —
          напишите в{" "}
          <Link
            href="/support"
            className="font-medium text-cyan underline decoration-cyan/40 underline-offset-2"
          >
            поддержку
          </Link>
          , и мы пришлём реквизиты в ответ.
        </p>
      )}
      <ul className="space-y-4">
        {[...filled, ...pending].map((bank) => (
          <li key={bank.id}>
            <BankCard bank={bank} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function BankCard({ bank }: { bank: DonateBank }) {
  return (
    <div className="glass rounded-2xl border border-glass-brd p-5">
      <h3 className="font-display text-base font-semibold text-text-0">
        {bank.name}
      </h3>
      <p className="mt-1 text-sm text-text-1">{bank.note}</p>
      <ul className="mt-4 space-y-2">
        {bank.lines.map((line) => (
          <li key={line.label}>
            {isRequisiteFilled(line) ? (
              <CopyField label={line.label} value={line.value as string} />
            ) : (
              <div className="flex items-center gap-3 rounded-xl border border-dashed border-glass-brd bg-bg-1 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <div className="text-xs uppercase tracking-wide text-text-2">
                    {line.label}
                  </div>
                  <div className="text-sm text-text-1">уточняется</div>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
