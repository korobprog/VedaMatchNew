import Link from "next/link";
import { redirect } from "next/navigation";
import { Header } from "@/components/header";
import { RecommendationsView } from "@/components/union/recommendations-view";
import { RecommendationFilters } from "@/components/union/recommendation-filters";
import { UnionNav } from "@/components/union/union-nav";
import { UnionTabBar } from "@/components/union/union-tabbar";
import { UnionTopBar } from "@/components/union/union-top-bar";
import { getProfile } from "@/lib/api";
import {
  getUnionChats,
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
  const [recommendations, counts, chats] = await Promise.all([
    getUnionRecommendations(params),
    getUnionConnectionCounts().catch(() => null),
    getUnionChats().catch(() => null),
  ]);
  if (recommendations === null) redirect("/union/profile");

  return (
    <div className="relative min-h-screen bg-bg-0">
      <BackgroundOrbs />
      <NoiseOverlay />
      <Header user={user} />
      <main className="mx-auto max-w-6xl px-4 py-8 pb-28">
        <UnionTopBar title="Знакомства" />
        <div className="mb-6 hidden md:block">
          <h1 className="font-display text-2xl font-bold text-text-0 sm:text-3xl">
            Знакомства
          </h1>
          <p className="mt-1 text-sm text-text-1">
            Люди, которые ближе всего вам по целям, ценностям и пути.
          </p>
        </div>
        <UnionNav incomingPending={counts?.incomingPending ?? 0} />

        <RecommendationFilters params={params} />

        <HistoryResetBanner restoredCount={first(params.historyReset)} />

        {recommendations.items.length === 0 ? (
          <div className="glass rounded-3xl border border-glass-brd p-10 text-center text-sm text-text-1">
            Пока нет подходящих людей по выбранным фильтрам. Попробуйте расширить
            радиус или сбросить часть условий.
            <br />
            Учтите: «Сбросить» очищает только видимые фильтры. Уже
            отсмотренные анкеты возвращаются отдельной кнопкой «Показать всех
            заново» выше, а желаемый возраст партнёра задаётся в{" "}
            <Link href="/union/profile" className="underline hover:text-text-0">
              настройках профиля
            </Link>{" "}
            и тоже сужает выдачу.
          </div>
        ) : (
          <>
            <div className="mb-4 text-sm text-text-2">
              Найдено: {recommendations.total}. Страница {recommendations.page} из{" "}
              {recommendations.totalPages}.
            </div>
            <RecommendationsView items={recommendations.items} />
            <Pagination
              params={params}
              page={recommendations.page}
              totalPages={recommendations.totalPages}
            />
          </>
        )}
      </main>
      <UnionTabBar
        incomingPending={counts?.incomingPending ?? 0}
        hasUnreadChats={(chats?.unreadTotal ?? 0) > 0}
      />
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

export function withPage(
  params: Record<string, string | string[] | undefined>,
  page: number,
) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (key === "page") continue;
    // Целей может быть несколько — иначе на второй странице осталась бы одна.
    for (const item of Array.isArray(value) ? value : [value]) {
      if (item) query.append(key, item);
    }
  }
  query.set("page", String(page));
  return query.toString();
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function HistoryResetBanner({
  restoredCount,
}: {
  restoredCount: string | undefined;
}) {
  if (restoredCount === undefined) return null;
  const count = Number(restoredCount);
  if (!Number.isFinite(count)) return null;

  return (
    <div className="mb-4 rounded-2xl border border-glass-brd bg-bg-1 px-4 py-3 text-sm text-text-1">
      {count > 0
        ? `Возвращено в колоду: ${count}. Смотрите заново ниже.`
        : "Возвращать пока некого — вы ещё не отсмотрели никого из доступных анкет. Если список пуст, дело не в истории показов: попробуйте расширить фильтры или радиус поиска."}
    </div>
  );
}
