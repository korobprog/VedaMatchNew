import { redirect } from "next/navigation";
import { redirectToLogin } from "@/lib/require-user";
import { needsWelcome } from "@/lib/welcome";
import { Header } from "@/components/header";
import { MotivationTopBar } from "@/components/motivation/motivation-top-bar";
import { MotivationCollections } from "@/components/motivation/collections-view";
import { getProfile } from "@/lib/api";
import { getMotivationCategories } from "@/lib/motivation-api";

/**
 * Папки готовых карточек. Лента отвечает на «покажи что-нибудь», этот экран —
 * на «покажи про Веды».
 */
export default async function MotivationCollectionsPage() {
  const [user, categories] = await Promise.all([
    getProfile(),
    getMotivationCategories(),
  ]);
  if (!user) redirectToLogin("/motivation/collections");
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
          action={{ href: "/motivation", label: "Лента" }}
        />
        <div className="mt-4 px-2">
          <MotivationCollections categories={categories ?? []} />
        </div>
      </main>
    </div>
  );
}
