import Link from "next/link";
import type { RewardsMeDto } from "@vedamatch/shared";

/**
 * Баллы в профиле — карточкой рядом с «Подпиской», а не строчкой-кнопкой
 * между градиентным CTA и красным «Выйти»: нейтральный контур в том ряду
 * читается как системная кнопка и глазом проскакивается. Баллы тратятся на
 * абонемент, поэтому стоят следом за ним и показывают число сразу — ради
 * него в раздел и заходят.
 *
 * `data` может быть `null`: упавший сервис баллов не должен уносить с собой
 * весь профиль, карточка тогда просто не показывается.
 */
export function RewardsProfileCard({ data }: { data: RewardsMeDto | null }) {
  if (!data) return null;

  return (
    <div className="glass mb-6 rounded-2xl border border-glass-brd p-6">
      <h2 className="mb-4 font-display text-lg font-semibold text-text-0">
        Баллы и приглашения
      </h2>
      <dl className="space-y-3 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-text-2">Баланс</dt>
          <dd className="font-mono font-medium text-text-0">
            {data.total} {data.total === 1 ? "балл" : "баллов"}
          </dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-text-2">Приглашено</dt>
          <dd className="font-mono font-medium text-text-0">
            {data.invitedTotal}
          </dd>
        </div>
      </dl>
      <p className="mt-4 text-sm text-text-1">
        {data.spendEnabled
          ? "Баллами можно закрыть часть стоимости абонемента."
          : "Баллы копятся: потратить их на абонемент можно будет после беты."}
      </p>
      <Link
        href="/rewards"
        className="btn-mint-outline mt-4 block rounded-xl px-4 py-3 text-center text-sm font-medium"
      >
        Пригласить друга
      </Link>
    </div>
  );
}
