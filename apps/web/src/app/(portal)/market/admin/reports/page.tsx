import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/require-user";
import { getMarketAdminReports } from "@/lib/market-api";
import { getServerLocale } from "@/i18n/get-locale";
import { AdminReportActions } from "@/components/market/admin-report-actions";
import { template } from "@/components/market/labels";

export default async function MarketAdminReportsPage() {
  const user = await requireUser();
  // Права проверяет и API, но страницу админа посторонним показывать незачем
  // даже пустой: сам факт её существования — лишняя подсказка.
  if (user.role !== "admin") notFound();

  const [t, locale, reports] = await Promise.all([
    getTranslations("Market"),
    getServerLocale(),
    getMarketAdminReports(),
  ]);

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 pb-24">
      <h1 className="mb-6 font-display text-2xl font-bold text-text-0">
        {t("admin.reports")}
      </h1>

      {!reports || reports.items.length === 0 ? (
        <p className="glass rounded-2xl border border-glass-brd p-6 text-sm text-text-1">
          {t("admin.reportsEmpty")}
        </p>
      ) : (
        <ul className="space-y-3">
          {reports.items.map((report) => (
            <li
              key={report.id}
              className="glass rounded-2xl border border-glass-brd p-4"
            >
              <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
                <span className="rounded-full border border-glass-brd px-2 py-0.5 text-text-2">
                  {t(`report.targets.${report.targetKind}`)}
                </span>
                <span className="rounded-full border border-magenta/40 px-2 py-0.5 text-magenta">
                  {t(`report.reasons.${report.reason}`)}
                </span>
                {report.targetHidden && (
                  <span className="rounded-full bg-glass-brd/40 px-2 py-0.5 text-text-2">
                    {t("admin.hidden")}
                  </span>
                )}
                <span className="text-text-2">
                  {new Date(report.createdAt).toLocaleDateString(locale)}
                </span>
              </div>

              <p className="text-sm font-medium text-text-0">
                {report.targetLabel}
              </p>

              <p className="mt-1 text-xs text-text-2">
                {template(t, "admin.reportsOn").replace(
                  "{count}",
                  String(report.openReportsCount),
                )}
                {report.reporter && ` · ${t("admin.reporter")}: ${report.reporter.name}`}
              </p>

              {report.note && (
                <p className="mt-2 whitespace-pre-line text-sm text-text-1">
                  {report.note}
                </p>
              )}

              <AdminReportActions reportId={report.id} />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
