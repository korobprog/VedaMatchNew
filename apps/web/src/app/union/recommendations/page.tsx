import Link from "next/link";
import { redirect } from "next/navigation";
import { Header } from "@/components/header";
import { RecommendationCard } from "@/components/union/recommendation-card";
import { RecommendationFilters } from "@/components/union/recommendation-filters";
import { UnionNav } from "@/components/union/union-nav";
import { getProfile } from "@/lib/api";
import {
  getUnionConnectionCounts,
  getUnionRecommendations,
} from "@/lib/union-api";
import { hasCompleteUnionLocation } from "@/lib/union-location";
import { BackgroundOrbs } from "@/components/landing/Orb";
import { NoiseOverlay } from "@/components/landing/NoiseOverlay";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function UnionRecommendationsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const user = await getProfile();
  if (!user) redirect("/login");
  if (!hasCompleteUnionLocation(user)) redirect("/union/location");

  const params = await searchParams;
  const [recommendations, counts] = await Promise.all([
    getUnionRecommendations(params),
    getUnionConnectionCounts().catch(() => null),
  ]);
  if (recommendations === null) redirect("/union");

  return (
    <div className="relative min-h-screen bg-bg-0">
      <BackgroundOrbs />
      <NoiseOverlay />
      <Header user={user} />
      <main className="mx-auto max-w-4xl px-4 py-8 pb-24">
        <h1 className="mb-6 font-display text-2xl font-bold text-text-0">
          Рекомендации
        </h1>
        <UnionNav incomingPending={counts?.incomingPending ?? 0} />

        <RecommendationFilters params={params} />

        {recommendations.items.length === 0 ? (
          <div className="glass rounded-2xl border border-glass-brd p-8 text-center text-sm text-text-1">
            Пока нет подходящих людей по выбранным фильтрам. Попробуйте расширить
            радиус или сбросить часть условий.
          </div>
        ) : (
          <>
            <div className="mb-3 text-sm text-text-2">
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
          className="rounded-xl glass border border-glass-brd px-4 py-2 text-sm font-medium text-text-1 hover:text-text-0"
        >
          ← Назад
        </Link>
      )}
      {page < totalPages && (
        <Link
          href={`/union/recommendations?${withPage(params, page + 1)}`}
          className="rounded-xl bg-gradient-to-r from-magenta to-[#B23EFF] px-4 py-2 text-sm font-medium text-white hover:shadow-[0_0_20px_rgba(255,62,158,0.4)]"
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
