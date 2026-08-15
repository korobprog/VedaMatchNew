import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { getProfile } from "@/lib/api";
import { Header } from "@/components/header";
import { MarketNav } from "@/components/market/market-nav";
import { navLabels } from "../labels";

export const metadata: Metadata = {
  title: "Правила Рынка — VedaMatch",
};

export default async function MarketRulesPage() {
  const user = await getProfile();
  if (!user) redirect("/login");

  const t = await getTranslations("Market");

  return (
    <div className="relative min-h-screen bg-bg-0">
      <Header user={user} />
      <main className="mx-auto max-w-3xl px-4 py-8 pb-24">
        <h1 className="mb-6 font-display text-2xl font-bold text-text-0">
          {t("rules.title")}
        </h1>
        <MarketNav active="rules" labels={navLabels(t)} />

        <p className="text-text-1">{t("rules.intro")}</p>

        <section className="glass mt-6 rounded-2xl border border-glass-brd p-5">
          <h2 className="mb-3 font-display text-lg font-semibold text-text-0">
            {t("rules.prohibitedTitle")}
          </h2>
          <ul className="list-inside list-disc space-y-1 text-sm text-text-1">
            <li>{t("rules.prohibited1")}</li>
            <li>{t("rules.prohibited2")}</li>
            <li>{t("rules.prohibited3")}</li>
            <li>{t("rules.prohibited4")}</li>
            <li>{t("rules.prohibited5")}</li>
          </ul>
        </section>

        <section className="glass mt-4 rounded-2xl border border-glass-brd p-5">
          <h2 className="mb-3 font-display text-lg font-semibold text-text-0">
            {t("rules.generalTitle")}
          </h2>
          <ul className="list-inside list-disc space-y-1 text-sm text-text-1">
            <li>{t("rules.general1")}</li>
            <li>{t("rules.general2")}</li>
            <li>{t("rules.general3")}</li>
            <li>{t("rules.general4")}</li>
          </ul>
        </section>

        <p className="mt-4 text-sm text-text-2">{t("rules.moderation")}</p>
      </main>
    </div>
  );
}
