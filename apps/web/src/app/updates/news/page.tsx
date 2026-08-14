import { getTranslations } from "next-intl/server";
import { getAnnouncements } from "@/lib/api";
import { getServerLocale } from "@/i18n/get-locale";

export default async function UpdatesNewsPage() {
  const [t, locale] = await Promise.all([
    getTranslations("Updates"),
    getServerLocale(),
  ]);
  const announcements = (await getAnnouncements(locale)) ?? [];

  if (announcements.length === 0) {
    return <p className="text-sm text-text-2">{t("emptyNews")}</p>;
  }

  return (
    <div className="space-y-6">
      {announcements.map((item) => (
        <article key={item.id} className="border-b border-glass-brd pb-6 last:border-0 last:pb-0">
          <p className="text-xs text-text-2">
            {new Date(item.publishedAt).toLocaleDateString(locale)}
          </p>
          <h2 className="mt-1 font-display text-lg font-semibold text-text-0">
            {item.title}
          </h2>
          <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-text-1">
            {item.body}
          </p>
        </article>
      ))}
    </div>
  );
}
