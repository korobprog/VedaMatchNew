import { getTranslations } from "next-intl/server";
import type { RoadmapStatus } from "@vedamatch/shared";
import { getRoadmap } from "@/lib/api";
import { getServerLocale } from "@/i18n/get-locale";

const statusOrder: RoadmapStatus[] = ["in_progress", "planned", "done"];

const statusColor: Record<RoadmapStatus, string> = {
  planned: "bg-glass text-text-2",
  in_progress: "bg-cyan/10 text-cyan",
  done: "bg-gold/10 text-gold",
};

export default async function UpdatesRoadmapPage() {
  const [t, locale] = await Promise.all([
    getTranslations("Updates"),
    getServerLocale(),
  ]);
  const items = (await getRoadmap(locale)) ?? [];

  if (items.length === 0) {
    return <p className="text-sm text-text-2">{t("emptyRoadmap")}</p>;
  }

  const grouped = statusOrder
    .map((status) => ({
      status,
      items: items.filter((item) => item.status === status),
    }))
    .filter((group) => group.items.length > 0);

  return (
    <div className="space-y-8">
      {grouped.map((group) => (
        <section key={group.status}>
          <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-text-2">
            {t(`roadmapStatus.${group.status}`)}
          </h2>
          <ul className="mt-3 space-y-3">
            {group.items.map((item) => (
              <li key={item.id} className="flex items-start gap-3">
                <span
                  className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${statusColor[item.status]}`}
                >
                  {t(`roadmapStatus.${item.status}`)}
                </span>
                <div>
                  <p className="text-sm font-medium text-text-0">{item.title}</p>
                  {item.description && (
                    <p className="mt-1 text-sm text-text-2">{item.description}</p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
