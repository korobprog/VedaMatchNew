import Link from "next/link";
import { HelpCircle } from "lucide-react";
import { Header } from "@/components/header";
import { redirectToLogin } from "@/lib/require-user";
import { MotivationTopBar } from "@/components/motivation/motivation-top-bar";
import { MotivationSettingsForm } from "@/components/motivation/motivation-settings-form";
import { MotivationRailSettings } from "@/components/motivation/rail-settings";
import { MotivationHomeButtonsSettings } from "@/components/motivation/home-buttons-settings";
import {
  categoryOptions,
  sourceOptions,
} from "@/components/motivation/home-buttons";
import { getProfile } from "@/lib/api";
import {
  getMotivationCategories,
  getMotivationFeedAttributions,
  getMotivationPreferences,
} from "@/lib/motivation-api";
import { BackgroundOrbs } from "@/components/landing/Orb";
import { NoiseOverlay } from "@/components/landing/NoiseOverlay";

export default async function MotivationSettingsPage() {
  const [user, preferences, attributions, categories] = await Promise.all([
    getProfile(),
    getMotivationPreferences(),
    // Источники — те, что есть в «Ленте»: туда ведёт первая кнопка на главной
    // (VED-401). Упавший список не роняет страницу настроек.
    getMotivationFeedAttributions("art").catch(() => null),
    getMotivationCategories().catch(() => null),
  ]);
  if (!user) redirectToLogin("/motivation/settings");
  const isAdmin = user.role === "admin" || user.role === "service-admin";

  return (
    <div className="relative min-h-dvh bg-bg-0">
      <BackgroundOrbs />
      <NoiseOverlay />
      <Header user={user} />
      <main className="mx-auto max-w-3xl px-2 py-4 pb-24 sm:px-4">
        <MotivationTopBar
          active="settings"
          isAdmin={isAdmin}
          title="Настройки ленты"
          action={{ href: "/motivation", label: "К ленте" }}
        />
        <div className="mt-4 px-2">
          <MotivationSettingsForm
            initial={preferences ?? { vaishnavaPercent: 50, language: "ru", profileTypes: [] }}
          />
          <MotivationHomeButtonsSettings
            sources={sourceOptions(
              attributions?.works ?? [],
              preferences?.homeSourceWork,
            )}
            categories={categoryOptions(
              categories ?? [],
              preferences?.homeCategorySlug,
            )}
            initialSource={preferences?.homeSourceWork ?? ""}
            initialCategory={preferences?.homeCategorySlug ?? ""}
          />
          <MotivationRailSettings />
          {/* Викторина (VED-656) — здесь, а не кнопкой в ряду под лентой. */}
          <Link
            href="/motivation/quiz"
            className="glass mt-6 flex min-h-14 items-center gap-3 rounded-2xl border border-glass-brd px-4 py-3 hover:border-cyan/60"
          >
            <HelpCircle aria-hidden className="size-6 shrink-0 text-cyan" />
            <span className="flex flex-col">
              <span className="font-semibold text-text-0">Викторина</span>
              <span className="text-sm text-text-1">
                Угадать по рисунку, какой стих Бхагавад-гиты на нём
              </span>
            </span>
          </Link>
        </div>
      </main>
    </div>
  );
}
