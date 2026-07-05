import Link from "next/link";
import { redirect } from "next/navigation";
import { getProfile } from "@/lib/api";
import { getUnionRecommendations } from "@/lib/union-api";
import { Header } from "@/components/header";
import { RecommendationCard } from "@/components/union/recommendation-card";

export default async function UnionRecommendationsPage() {
  const user = await getProfile();
  if (!user) redirect("/login");

  const recommendations = await getUnionRecommendations();
  // null — профиль Union еще не заполнен (API вернул 404)
  if (recommendations === null) redirect("/union");

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <Header user={user} />
      <main className="mx-auto max-w-4xl px-4 py-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
            Рекомендации
          </h1>
          <Link
            href="/union"
            className="text-sm font-medium text-amber-700 hover:underline dark:text-amber-400"
          >
            ← Мой профиль Union
          </Link>
        </div>

        {recommendations.length === 0 ? (
          <div className="rounded-2xl border border-zinc-200 bg-white p-8 text-center text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
            Пока нет подходящих людей. Загляните позже — сервис только
            развивается.
          </div>
        ) : (
          <div className="space-y-4">
            {recommendations.map((item) => (
              <RecommendationCard key={item.user.id} item={item} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
