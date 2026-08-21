import { getTranslations } from "next-intl/server";
import { AdminReportActions } from "@/components/market/admin-report-actions";
import { MarketAdminTabs } from "@/components/market/admin/admin-tabs";
import { HideListingForm } from "@/components/market/admin/hide-listing-form";
import { template } from "@/components/market/labels";
import { getServerLocale } from "@/i18n/get-locale";
import { getMarketAdminReports } from "@/lib/market-api";

export const metadata = {
  title: "Жалобы Рынка",
  robots: { index: false, follow: false },
};

export default async function AdminMarketReportsPage() {
  const [t, locale, reports] = await Promise.all([
    getTranslations("Market"),
    getServerLocale(),
    getMarketAdminReports(),
  ]);
  const items = reports?.items ?? [];

  return (
    <>
      <MarketAdminTabs active="reports" reportsCount={items.length} />

      <p className="mb-4 max-w-3xl text-sm text-text-1">
        «Подтвердить и скрыть» убирает объект из выдачи насовсем. «Отклонить»
        закрывает все открытые жалобы на этот объект и снимает автоскрытие.
      </p>

      {items.length === 0 ? (
        <p className="glass rounded-2xl border border-glass-brd p-6 text-sm text-text-1">
          {t("admin.reportsEmpty")}
        </p>
      ) : (
        <ul className="space-y-3">
          {items.map((report) => (
            <li
              key={report.id}
              className="glass rounded-2xl border border-glass-brd p-4"
            >
              <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
                <span className="rounded-full border border-glass-brd px-2 py-0.5 text-text-2">
                  {t(`report.targets.${report.targetKind}`)}
                </span>
                <span className="rounded-full border border-magenta/40 px-2 py-0.5 text-text-1">
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
                {report.reporter &&
                  ` · ${t("admin.reporter")}: ${report.reporter.name}`}
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

      <HideListingForm />
    </>
  );
}
