import { redirect } from "next/navigation";
import type { RewardsFraudReason } from "@vedamatch/shared";
import { RewardsLedgerTable } from "@/components/admin/rewards-ledger-table";
import { RewardsSettingsForm } from "@/components/admin/rewards-settings-form";
import { requireUser } from "@/lib/require-user";
import {
  getAdminRewardsFraud,
  getAdminRewardsLedger,
  getAdminRewardsSettings,
  getAdminRewardsSummary,
} from "@/lib/rewards-api";

export const metadata = {
  title: "Баллы и рефералы",
  robots: { index: false, follow: false },
};

/** Почему начисление не создано — словами, а не кодом енума. */
const FRAUD_LABELS: Record<RewardsFraudReason, string> = {
  self_invite: "Переход по собственной ссылке",
  email_alias: "Плюс-адрес той же почты",
  device_match: "То же устройство",
  ip_match: "Тот же IP в пределах суток",
  monthly_cap: "Месячный потолок",
};

const dateFormat = new Intl.DateTimeFormat("ru-RU", {
  dateStyle: "short",
  timeStyle: "short",
});

export default async function AdminRewardsPage() {
  const user = await requireUser();
  // Баллы — портальная механика, как биллинг: раздел только для роли admin.
  if (user.role !== "admin") redirect("/");

  const [summary, ledger, fraud, settings] = await Promise.all([
    getAdminRewardsSummary(),
    getAdminRewardsLedger(),
    getAdminRewardsFraud(),
    getAdminRewardsSettings(),
  ]);
  if (!summary || !settings) {
    throw new Error("Не удалось загрузить раздел баллов");
  }

  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="font-display text-2xl font-bold text-text-0">
          Баллы и рефералы
        </h1>
        <p className="mt-1 text-sm text-text-1">
          Режим:{" "}
          {summary.mode === "beta"
            ? "бета — списание закрыто, баллы копятся"
            : "обычный — списание доступно"}
          .
        </p>
      </header>

      <section>
        <h2 className="mb-3 font-display text-lg font-semibold text-text-0">
          Сводка
        </h2>
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          {[
            { label: "Приглашений", value: summary.invitedTotal },
            { label: "Квалифицировано", value: summary.qualifiedTotal },
            {
              label: "Конверсия",
              value: `${Math.round(summary.conversion * 100)}%`,
            },
            { label: "Начислено баллов", value: summary.pointsAwarded },
            { label: "Отменено баллов", value: summary.pointsRevoked },
            { label: "Подозрений", value: summary.fraudSuspicions },
          ].map((item) => (
            <div
              key={item.label}
              className="glass rounded-2xl border border-glass-brd p-4"
            >
              <dt className="text-sm text-text-1">{item.label}</dt>
              <dd className="font-mono text-2xl text-text-0">{item.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section>
        <h2 className="mb-3 font-display text-lg font-semibold text-text-0">
          Топ приглашающих
        </h2>
        {summary.topInviters.length === 0 ? (
          <p className="text-sm text-text-1">Приглашений пока нет.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[32rem] border-collapse text-sm">
              <thead>
                <tr className="border-b border-glass-brd text-left text-text-1">
                  <th className="py-2 pr-3 font-medium">Кто</th>
                  <th className="py-2 pr-3 font-medium">Приглашено</th>
                  <th className="py-2 pr-3 font-medium">Квалифицировано</th>
                  <th className="py-2 font-medium">Баллов</th>
                </tr>
              </thead>
              <tbody>
                {summary.topInviters.map((row) => (
                  <tr key={row.userId} className="border-b border-glass-brd">
                    <td className="py-2 pr-3 text-text-0">{row.name}</td>
                    <td className="py-2 pr-3 font-mono text-text-0">
                      {row.invited}
                    </td>
                    <td className="py-2 pr-3 font-mono text-text-0">
                      {row.qualified}
                    </td>
                    <td className="py-2 font-mono text-text-0">{row.points}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 font-display text-lg font-semibold text-text-0">
          Начисления
        </h2>
        <RewardsLedgerTable items={ledger?.items ?? []} />
      </section>

      <section>
        <h2 className="mb-3 font-display text-lg font-semibold text-text-0">
          Журнал подозрений
        </h2>
        {(fraud?.items.length ?? 0) === 0 ? (
          <p className="text-sm text-text-1">Подозрений нет.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[40rem] border-collapse text-sm">
              <thead>
                <tr className="border-b border-glass-brd text-left text-text-1">
                  <th className="py-2 pr-3 font-medium">Когда</th>
                  <th className="py-2 pr-3 font-medium">Причина</th>
                  <th className="py-2 pr-3 font-medium">Пригласивший</th>
                  <th className="py-2 pr-3 font-medium">Приглашённый</th>
                  <th className="py-2 font-medium">Что совпало</th>
                </tr>
              </thead>
              <tbody>
                {(fraud?.items ?? []).map((row) => (
                  <tr key={row.id} className="border-b border-glass-brd">
                    <td className="py-2 pr-3 text-text-1">
                      {dateFormat.format(new Date(row.createdAt))}
                    </td>
                    <td className="py-2 pr-3 text-text-0">
                      {FRAUD_LABELS[row.reason]}
                    </td>
                    <td className="py-2 pr-3 text-text-0">
                      {row.inviterName ?? "—"}
                    </td>
                    <td className="py-2 pr-3 text-text-0">
                      {row.inviteeName ?? "—"}
                    </td>
                    <td className="py-2 text-text-1">{row.details ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 font-display text-lg font-semibold text-text-0">
          Настройки
        </h2>
        <RewardsSettingsForm settings={settings} />
      </section>
    </div>
  );
}
