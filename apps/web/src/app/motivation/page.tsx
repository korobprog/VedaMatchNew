import { redirect } from "next/navigation";
import { redirectToLogin } from "@/lib/require-user";
import { Header } from "@/components/header";
import { MotivationFeed } from "@/components/motivation/motivation-feed";
import { MotivationTopBar } from "@/components/motivation/motivation-top-bar";
import { ReelsChrome } from "@/components/motivation/reels-chrome";
import { ReelsFeed, type ReelsTab } from "@/components/motivation/reels-feed";
import { getDonationSettings, getProfile } from "@/lib/api";
import { getMotivationFeed } from "@/lib/motivation-api";
import { BackgroundOrbs } from "@/components/landing/Orb";
import { NoiseOverlay } from "@/components/landing/NoiseOverlay";

/**
 * Лента мотивации: по умолчанию — рилсы (один пост на экран, свайп вверх),
 * `?view=list` — прежняя карточная лента как запасной вид. `?tab=saved`
 * листает избранное в том же формате.
 */
export default async function MotivationPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; tab?: string; post?: string }>;
}) {
  const params = await searchParams;
  const view = params.view === "list" ? "list" : "reels";
  const tab: ReelsTab = params.tab === "saved" ? "saved" : "forYou";
  const [user, feed, donation] = await Promise.all([
    getProfile(),
    // `?post=slug` открывает ленту на конкретном рилсе — так работает переход
    // из мастера и из «Моих рилсов».
    getMotivationFeed(tab === "saved" ? "favorites" : "all", params.post),
    getDonationSettings(),
  ]);
  if (!user) redirectToLogin("/motivation");
  // Новичок идёт в мастер: там тот же вопрос об этапе, но после имени
  // и города и с прогрессом. Страница анкеты остаётся для повторного
  // прохождения, её не редирект открывает, а ссылка из профиля.
  if (!user.spiritualStage) redirect("/welcome");
  const isAdmin = user.role === "admin" || user.role === "service-admin";
  const initial = feed ?? { items: [], nextCursor: null };

  if (view === "list") {
    return (
      <div className="relative min-h-dvh bg-bg-0">
        <BackgroundOrbs />
        <NoiseOverlay />
        <Header user={user} />
        <main className="mx-auto max-w-3xl px-2 py-4 pb-24 sm:px-4">
          <MotivationTopBar
            active="feed"
            isAdmin={isAdmin}
            action={{ href: "/motivation", label: "Рилсы" }}
          />
          <div className="mt-4 px-2">
            <MotivationFeed initial={initial} />
          </div>
        </main>
      </div>
    );
  }

  return (
    // Рилс — на весь экран, без общей шапки портала и строки навигации над
    // ним: они отняли бы у видео как раз ту высоту, ради которой открывают
    // полноэкранную ленту. Кнопка назад и меню разделов теперь свои,
    // прозрачным оверлеем поверх кадра — см. ReelsChrome.
    <div className="relative h-dvh min-h-[560px] bg-bg-0">
      <BackgroundOrbs />
      <NoiseOverlay />
      <div className="relative mx-auto h-full w-full max-w-[480px]">
        <ReelsFeed initial={initial} tab={tab} donation={donation} />
        <ReelsChrome isAdmin={isAdmin} />
      </div>
    </div>
  );
}
