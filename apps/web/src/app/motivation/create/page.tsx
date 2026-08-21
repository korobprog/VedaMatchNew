import { redirect } from "next/navigation";
import { redirectToLogin } from "@/lib/require-user";
import { Header } from "@/components/header";
import { MotivationTopBar } from "@/components/motivation/motivation-top-bar";
import { ReelWizard } from "@/components/motivation/reel-wizard";
import { getDonationSettings, getProfile } from "@/lib/api";
import { getMotivationPreferences } from "@/lib/motivation-api";
import { BackgroundOrbs } from "@/components/landing/Orb";
import { NoiseOverlay } from "@/components/landing/NoiseOverlay";

/**
 * «Свой рилс»: мастер из трёх шагов. Из читалки приходит `?from=vedabase&
 * book=…&chapter=…&text=…` — цитата подставляется и сверяется с главой;
 * `?reel=<id>` открывает экран статуса уже созданного рилса.
 */
export default async function MotivationCreatePage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; book?: string; chapter?: string; text?: string; reel?: string }>;
}) {
  const params = await searchParams;
  const [user, donation, preferences] = await Promise.all([
    getProfile(),
    getDonationSettings(),
    getMotivationPreferences(),
  ]);
  if (!user) redirectToLogin("/motivation/create");
  if (!user.spiritualStage) redirect("/self-identification");
  const isAdmin = user.role === "admin" || user.role === "service-admin";
  const prefill =
    params.from === "vedabase" && params.book && params.chapter && params.text
      ? { book: params.book, chapter: params.chapter, text: params.text }
      : {};
  // Трек по умолчанию — тот, которого в настройках ленты у человека больше.
  const defaultTrack = (preferences?.vaishnavaPercent ?? 50) > 50 ? "vaishnava" : "universal";

  return (
    <div className="relative min-h-dvh bg-bg-0">
      <BackgroundOrbs />
      <NoiseOverlay />
      <Header user={user} />
      <main className="mx-auto max-w-2xl px-2 py-4 pb-24 sm:px-4">
        <MotivationTopBar active="feed" isAdmin={isAdmin} title="Свой рилс" />
        <p className="mt-3 max-w-prose px-2 text-sm text-text-1">
          Цитата → стиль → проверка → картинка. В бете — один рилс в день бесплатно, генерацию оплачивает проект.
        </p>
        <div className="mt-4 px-2">
          <ReelWizard prefill={{ ...prefill, reelId: params.reel }} donation={donation} defaultTrack={defaultTrack} />
        </div>
      </main>
    </div>
  );
}
