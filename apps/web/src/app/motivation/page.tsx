import Link from "next/link";
import { redirect } from "next/navigation";
import { Shuffle } from "lucide-react";
import { redirectToLogin } from "@/lib/require-user";
import { needsWelcome } from "@/lib/welcome";
import { Header } from "@/components/header";
import { MotivationFeed } from "@/components/motivation/motivation-feed";
import { MotivationTopBar } from "@/components/motivation/motivation-top-bar";
import { ReelsChrome } from "@/components/motivation/reels-chrome";
import { ReelsFeed, type ReelsTab } from "@/components/motivation/reels-feed";
import { getDonationSettings, getProfile } from "@/lib/api";
import {
  getMotivationAudio,
  getMotivationFeed,
  getMotivationStats,
} from "@/lib/motivation-api";
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
  searchParams: Promise<{
    view?: string;
    tab?: string;
    post?: string;
    order?: string;
  }>;
}) {
  const params = await searchParams;
  const view = params.view === "list" ? "list" : "reels";
  const tab: ReelsTab = params.tab === "saved" ? "saved" : "forYou";
  /* Случайный порядок. Живёт в адресе, а не в настройках: это не то, что
     выбирают однажды и надолго, — это «перемешай сейчас», и уходить за ним
     на страницу настроек дороже, чем нажать кнопку над лентой. */
  const order = params.order === "random" ? ("random" as const) : undefined;
  const [user, feed, donation, stats, audio] = await Promise.all([
    getProfile(),
    // `?post=slug` открывает ленту на конкретном рилсе — так работает переход
    // из мастера и из «Моих рилсов».
    getMotivationFeed(
      tab === "saved" ? "favorites" : "all",
      params.post,
      order,
    ),
    getDonationSettings(),
    getMotivationStats(),
    // Фон для чтения. Пустой список — кнопки музыки в ленте не будет.
    getMotivationAudio(),
  ]);
  if (!user) redirectToLogin("/motivation");
  // Новичок идёт в мастер: там тот же вопрос об этапе, но после имени
  // и города и с прогрессом. Страница анкеты остаётся для повторного
  // прохождения, её не редирект открывает, а ссылка из профиля.
  if (needsWelcome(user)) redirect("/welcome");
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
            // Порядок переезжает вместе с человеком: вернуться к рилсам и
            // молча получить другую ленту — не то, о чём просили.
            action={{
              href: order ? "/motivation?order=random" : "/motivation",
              label: "Рилсы",
            }}
            count={stats?.published}
          />
          <div className="mt-4 px-2">
            {/* Перемешать — и здесь тоже: список и рилсы показывают одну и ту
                же ленту, и порядок у неё должен переключаться одинаково. */}
            <Link
              href={
                order
                  ? "/motivation?view=list"
                  : "/motivation?view=list&order=random"
              }
              className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-glass-brd bg-glass px-3 py-1.5 text-xs font-medium text-text-1 hover:text-text-0"
            >
              <Shuffle className="size-3.5" aria-hidden />
              {order ? "По порядку" : "Вперемешку"}
            </Link>
            <MotivationFeed initial={initial} order={order} />
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
        <ReelsFeed
          initial={initial}
          tab={tab}
          donation={donation}
          order={order}
          isAdmin={isAdmin}
          audio={audio}
        />
        <ReelsChrome isAdmin={isAdmin} order={order} count={stats?.published} />
      </div>
    </div>
  );
}
