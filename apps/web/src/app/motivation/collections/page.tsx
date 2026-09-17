import { redirect } from "next/navigation";
import { redirectToLogin } from "@/lib/require-user";
import { needsWelcome } from "@/lib/welcome";
import { Header } from "@/components/header";
import { MotivationTopBar } from "@/components/motivation/motivation-top-bar";
import {
  CategoryFeedSwitch,
  MotivationCollections,
} from "@/components/motivation/collections-view";
import {
  feedStyleOf,
  parseReelsTab,
  reelsHref,
} from "@/components/motivation/feed-style";
import { getProfile } from "@/lib/api";
import { getMotivationCategories } from "@/lib/motivation-api";

/**
 * Папки готовых карточек. Лента отвечает на «покажи что-нибудь», этот экран —
 * на «покажи про Веды».
 *
 * У «Для вас» и «Открыток» меню своё (VED-139): `?tab=cards` — категории и
 * счётчики открыток, без него — афоризмов с иллюстрацией. Избранное папок не
 * имеет, поэтому `?tab=saved` читается как «Для вас».
 */
export default async function MotivationCollectionsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const parsed = parseReelsTab((await searchParams).tab);
  const tab = parsed === "cards" ? "cards" : "forYou";
  const [user, categories] = await Promise.all([
    getProfile(),
    getMotivationCategories(feedStyleOf(tab)),
  ]);
  if (!user) redirectToLogin(
      tab === "cards"
        ? "/motivation/collections?tab=cards"
        : "/motivation/collections",
    );
  if (needsWelcome(user)) redirect("/welcome");
  const isAdmin = user.role === "admin" || user.role === "service-admin";

  return (
    <div className="relative min-h-dvh bg-bg-0">
      <Header user={user} />
      <main className="mx-auto max-w-3xl px-2 py-4 pb-24 sm:px-4">
        <MotivationTopBar
          active="collections"
          isAdmin={isAdmin}
          title="Категории"
          // Назад — в ту же ленту, чьё это меню.
          action={{ href: reelsHref({ tab }), label: "Лента" }}
        />
        <div className="mt-4 space-y-4 px-2">
          <CategoryFeedSwitch tab={tab} />
          <MotivationCollections categories={categories ?? []} tab={tab} />
        </div>
      </main>
    </div>
  );
}
