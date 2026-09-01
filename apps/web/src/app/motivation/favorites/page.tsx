import { redirect } from "next/navigation";
import { Header } from "@/components/header";
import { redirectToLogin } from "@/lib/require-user";
import { needsWelcome } from "@/lib/welcome";
import { MotivationFeed } from "@/components/motivation/motivation-feed";
import { MotivationTopBar } from "@/components/motivation/motivation-top-bar";
import { getProfile } from "@/lib/api";
import { getMotivationFeed } from "@/lib/motivation-api";
import { BackgroundOrbs } from "@/components/landing/Orb";
import { NoiseOverlay } from "@/components/landing/NoiseOverlay";

/**
 * Избранное списком. Лента-рилсы показывает то же самое во вкладке
 * «Избранное», но списком удобнее искать глазами уже знакомое.
 */
export default async function MotivationFavoritesPage() {
  const [user, feed] = await Promise.all([getProfile(), getMotivationFeed("favorites")]);
  if (!user) redirectToLogin("/motivation/favorites");
  // Новичок идёт в мастер: там тот же вопрос об этапе, но после имени
  // и города и с прогрессом. Страница анкеты остаётся для повторного
  // прохождения, её не редирект открывает, а ссылка из профиля.
  if (needsWelcome(user)) redirect("/welcome");
  const isAdmin = user.role === "admin" || user.role === "service-admin";

  return (
    <div className="relative min-h-dvh bg-bg-0">
      <BackgroundOrbs />
      <NoiseOverlay />
      <Header user={user} />
      <main className="mx-auto max-w-3xl px-2 py-4 pb-24 sm:px-4">
        <MotivationTopBar
          active="favorites"
          isAdmin={isAdmin}
          title="Избранное"
          action={{ href: "/motivation?tab=saved", label: "Рилсами" }}
        />
        <div className="mt-4 px-2">
          <MotivationFeed initial={feed ?? { items: [], nextCursor: null }} favorites />
        </div>
      </main>
    </div>
  );
}
