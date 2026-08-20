import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Navbar } from "@/components/landing/Navbar";
import { BackgroundOrbs } from "@/components/landing/Orb";
import { NoiseOverlay } from "@/components/landing/NoiseOverlay";
import { getCurrentRelease } from "@/lib/api";
import { getServerLocale } from "@/i18n/get-locale";

export const metadata: Metadata = {
  title: "Версия и новости",
  description: "Текущая версия приложения, история релизов, новости и roadmap VedaMatch.",
};

const tabs = [
  { href: "/updates/news", key: "news" },
  { href: "/updates/history", key: "history" },
  { href: "/updates/roadmap", key: "roadmap" },
] as const;

/** Общая рамка страницы «Версия и новости»: доступна и гостям, и авторизованным. */
export default async function UpdatesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [t, locale] = await Promise.all([
    getTranslations("Updates"),
    getServerLocale(),
  ]);
  const current = await getCurrentRelease(locale);

  return (
    <div className="relative min-h-dvh bg-bg-0">
      <BackgroundOrbs />
      <NoiseOverlay />
      <Navbar />
      <main className="mx-auto max-w-3xl px-4 pt-28 pb-24">
        <h1 className="font-display text-2xl font-bold text-text-0 md:text-3xl">
          {t("title")}
        </h1>

        {current && (
          <div className="glass mt-4 rounded-2xl border border-glass-brd p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-text-2">
              {t("currentVersion")}
            </p>
            <p className="mt-1 font-display text-xl font-semibold text-text-0">
              v{current.version}
            </p>
            <p className="mt-1 text-sm text-text-2">
              {t("releasedAt", {
                date: new Date(current.releasedAt).toLocaleDateString(locale),
              })}
            </p>
          </div>
        )}

        <nav className="mt-6 flex flex-wrap gap-2">
          {tabs.map((tab) => (
            <Link
              key={tab.href}
              href={tab.href}
              className="rounded-xl border border-glass-brd px-4 py-2 text-sm font-medium text-text-1 transition hover:border-magenta/30 hover:text-text-0"
            >
              {t(`tabs.${tab.key}`)}
            </Link>
          ))}
        </nav>

        <div className="glass mt-6 rounded-2xl border border-glass-brd p-6 md:p-8">
          {children}
        </div>
      </main>
    </div>
  );
}
