import { redirect } from "next/navigation";
import { redirectToLogin } from "@/lib/require-user";
import { Header } from "@/components/header";
import { getProfile } from "@/lib/api";
import { getInstallEnvironmentSummary } from "@/lib/telemetry-server-api";
import { BackgroundOrbs } from "@/components/landing/Orb";
import { NoiseOverlay } from "@/components/landing/NoiseOverlay";
import { browserNames } from "@/lib/pwa/browser-names";
import {
  buildInstallEnvironmentTable,
  formatShare,
} from "@/lib/pwa/install-environment-view";

export default async function AdminPwaPage() {
  const user = await getProfile();
  if (!user) redirectToLogin("/admin/pwa");
  if (user.role !== "admin") redirect("/");

  const summary = await getInstallEnvironmentSummary();
  if (!summary) throw new Error("Не удалось загрузить замер установки");

  const table = buildInstallEnvironmentTable(summary);

  return (
    <div className="relative min-h-dvh bg-bg-0">
      <BackgroundOrbs />
      <NoiseOverlay />
      <Header user={user} />
      <main className="mx-auto max-w-3xl px-4 py-8 pb-24">
        <h1 className="mb-2 font-display text-2xl font-bold text-text-0">
          Установка приложения
        </h1>
        <p className="mb-6 text-text-1">
          С чего люди открывают портал. Настоящее приложение на Android даёт
          только Chrome и Samsung Internet, на iPhone — Safari; остальные
          кладут на экран ярлык, открывающийся внутри браузера.
        </p>

        <div className="grid gap-3 sm:grid-cols-3">
          <Tile label="Всего в замере" value={String(summary.total)} />
          <Tile
            label="Открывают как приложение"
            value={`${summary.installed} · ${formatShare(summary.installed, summary.total)}%`}
          />
          <Tile
            label="В браузере без установки"
            value={`${summary.deadEnd} · ${formatShare(summary.deadEnd, summary.total)}%`}
            alarming
          />
        </div>

        {table.length === 0 ? (
          <p className="mt-6 text-text-2">
            Замеров пока нет — первая запись появится, когда кто-нибудь откроет
            портал.
          </p>
        ) : (
          <div className="glass mt-6 overflow-x-auto rounded-2xl border border-glass-brd">
            <table className="w-full min-w-[28rem] text-sm">
              <thead>
                <tr className="border-b border-glass-brd text-left text-text-2">
                  <th className="px-4 py-3 font-medium">Браузер</th>
                  <th className="px-4 py-3 font-medium">Людей</th>
                  <th className="px-4 py-3 font-medium">Доля</th>
                  <th className="px-4 py-3 font-medium">Из них «установили»</th>
                </tr>
              </thead>
              <tbody>
                {table.map((row) => (
                  <tr
                    key={row.browser}
                    className="border-b border-glass-brd last:border-0"
                  >
                    <td className="px-4 py-3 text-text-0">
                      {browserNames[row.browser]}
                      {!row.standaloneCapable && (
                        <span className="ml-2 rounded-full border border-glass-brd px-2 py-0.5 text-xs text-text-2">
                          без установки
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-text-1">
                      {row.users}
                    </td>
                    <td className="px-4 py-3 font-mono text-text-1">
                      {row.share}%
                    </td>
                    <td className="px-4 py-3 font-mono text-text-1">
                      {row.installed}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}

function Tile({
  label,
  value,
  alarming,
}: {
  label: string;
  value: string;
  alarming?: boolean;
}) {
  return (
    <div className="glass rounded-2xl border border-glass-brd p-4">
      <p className="text-sm text-text-2">{label}</p>
      <p
        className={`mt-1 font-mono text-2xl font-bold ${alarming ? "text-magenta" : "text-text-0"}`}
      >
        {value}
      </p>
    </div>
  );
}
