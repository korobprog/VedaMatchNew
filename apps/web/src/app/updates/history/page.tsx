import { getTranslations } from "next-intl/server";
import { getReleases } from "@/lib/api";
import { getServerLocale } from "@/i18n/get-locale";

const changeTypeColor: Record<string, string> = {
  feature: "text-magenta",
  fix: "text-cyan",
  improvement: "text-gold",
};

export default async function UpdatesHistoryPage() {
  const [t, locale] = await Promise.all([
    getTranslations("Updates"),
    getServerLocale(),
  ]);
  const releases = (await getReleases(locale)) ?? [];

  if (releases.length === 0) {
    return <p className="text-sm text-text-2">{t("emptyHistory")}</p>;
  }

  return (
    <div className="space-y-8">
      {releases.map((release) => (
        <article key={release.id} className="border-b border-glass-brd pb-8 last:border-0 last:pb-0">
          <div className="flex items-center gap-2">
            <h2 className="font-display text-lg font-semibold text-text-0">
              v{release.version}
            </h2>
            {release.isCurrent && (
              <span className="rounded-full bg-magenta/10 px-2 py-0.5 text-xs font-medium text-magenta">
                {t("currentVersion")}
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-text-2">
            {new Date(release.releasedAt).toLocaleDateString(locale)}
          </p>
          <ul className="mt-3 space-y-1.5">
            {release.changes.map((change) => (
              <li key={change.id} className="flex items-start gap-2 text-sm text-text-1">
                <span className={`mt-0.5 shrink-0 text-xs font-medium ${changeTypeColor[change.type] ?? "text-text-2"}`}>
                  {t(`changeType.${change.type}`)}
                </span>
                <span>{change.title}</span>
              </li>
            ))}
          </ul>
        </article>
      ))}
    </div>
  );
}
