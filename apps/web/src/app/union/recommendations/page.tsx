import Link from "next/link";
import { redirect } from "next/navigation";
import { getProfile } from "@/lib/api";
import { getUnionRecommendations } from "@/lib/union-api";
import { Header } from "@/components/header";
import { RecommendationCard } from "@/components/union/recommendation-card";
import { RecommendationFilters } from "@/components/union/recommendation-filters";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function UnionRecommendationsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const user = await getProfile();
  if (!user) redirect("/login");

  const params = await searchParams;
  const recommendations = await getUnionRecommendations(params);
  // null — профиль Union ещё не заполнен (API вернул 404)
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

        <RecommendationFilters params={params} />

        {recommendations.items.length === 0 ? (
          <div className="rounded-2xl border border-zinc-200 bg-white p-8 text-center text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
            Пока нет подходящих людей по выбранным фильтрам. Попробуйте расширить
            радиус или сбросить часть условий.
          </div>
        ) : (
          <>
            <div className="mb-3 text-sm text-zinc-500">
              Найдено: {recommendations.total}. Страница {recommendations.page} из{" "}
              {recommendations.totalPages}.
            </div>
            <div className="space-y-4">
              {recommendations.items.map((item) => (
                <RecommendationCard key={item.user.id} item={item} />
              ))}
            </div>
            <Pagination
              params={params}
              page={recommendations.page}
              totalPages={recommendations.totalPages}
            />
          </>
        )}
      </main>
    </div>
  );
}

function Pagination({
  params,
  page,
  totalPages,
}: {
  params: Record<string, string | string[] | undefined>;
  page: number;
  totalPages: number;
}) {
  if (totalPages <= 1) return null;
  return (
    <div className="mt-6 flex justify-center gap-3">
      {page > 1 && (
        <Link
          href={`/union/recommendations?${withPage(params, page - 1)}`}
          className="rounded-xl border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          ← Назад
        </Link>
      )}
      {page < totalPages && (
        <Link
          href={`/union/recommendations?${withPage(params, page + 1)}`}
          className="rounded-xl bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700"
        >
          Далее →
        </Link>
      )}
    </div>
  );
}

function withPage(
  params: Record<string, string | string[] | undefined>,
  page: number,
) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    const first = Array.isArray(value) ? value[0] : value;
    if (first && key !== "page") query.set(key, first);
  }
  query.set("page", String(page));
  return query.toString();
}
