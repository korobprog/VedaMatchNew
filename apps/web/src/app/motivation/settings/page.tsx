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
        </div>
      </main>
    </div>
  );
}
