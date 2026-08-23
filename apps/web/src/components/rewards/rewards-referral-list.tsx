import type { RewardsReferralDto } from "@vedamatch/shared";
import { REFERRAL_STATUS_LABELS } from "@/lib/rewards-share";

const dateFormat = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

/** Приглашённые обоих уровней со статусом и датой. */
export function RewardsReferralList({
  items,
}: {
  items: RewardsReferralDto[];
}) {
  if (items.length === 0) {
    return (
      <section className="glass mb-6 rounded-2xl border border-glass-brd p-6">
        <h2 className="mb-2 font-display text-lg font-semibold text-text-0">
          Приглашённые
        </h2>
        <p className="font-body text-sm text-text-1">
          Пока никого. Баллы придут, когда приглашённый заполнит профиль и
          что-нибудь сделает на портале — это несколько дней, не мгновение.
        </p>
      </section>
    );
  }

  return (
    <section className="glass mb-6 rounded-2xl border border-glass-brd p-6">
      <h2 className="mb-4 font-display text-lg font-semibold text-text-0">
        Приглашённые
      </h2>
      <ul className="flex flex-col gap-3">
        {items.map((item) => (
          <li
            key={item.id}
            className="flex flex-wrap items-center gap-3 border-b border-glass-brd pb-3 last:border-0 last:pb-0"
          >
            {item.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={item.avatarUrl}
                alt=""
                className="h-10 w-10 rounded-full"
                referrerPolicy="no-referrer"
              />
            ) : (
              <span
                aria-hidden
                className="flex h-10 w-10 items-center justify-center rounded-full bg-glass font-body text-text-0"
              >
                {item.name.charAt(0).toUpperCase()}
              </span>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate font-body text-text-0">{item.name}</p>
              <p className="font-body text-sm text-text-1">
                {dateFormat.format(new Date(item.createdAt))}
                {item.level === 2 && " · второй уровень"}
              </p>
            </div>
            <div className="text-right">
              <p className="font-body text-sm text-text-1">
                {REFERRAL_STATUS_LABELS[item.status]}
              </p>
              {item.points !== null && item.points > 0 && (
                <p className="font-mono text-text-0">+{item.points}</p>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
