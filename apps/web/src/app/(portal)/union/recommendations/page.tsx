import Link from "next/link";
import { redirect } from "next/navigation";
import { RecommendationsView } from "@/components/union/recommendations-view";
import { RecommendationsEmpty } from "@/components/union/recommendations-empty";
import { countNarrowingFilters } from "@/components/union/recommendation-empty-state";
import { RecommendationFilters } from "@/components/union/recommendation-filters";
import { UnionNav } from "@/components/union/union-nav";
import { UnionTabBar } from "@/components/union/union-tabbar";
import { UnionTopBar } from "@/components/union/union-top-bar";
import { requireUser } from "@/lib/require-user";
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
  const user = await requireUser();
  if (!hasCompleteUnionLocation(user)) redirect("/union/location");

  const params = await searchParams;
  const [recommendations, counts, chats] = await Promise.all([
    getUnionRecommendations(params),
    getUnionConnectionCounts().catch(() => null),
    getUnionChats().catch(() => null),
  ]);
  if (recommendations === null) redirect("/union/profile");

  // Сколько подходящих анкет скрыто историей показов — считаем только на
  // пустой выдаче и только когда отсмотренные ещё не показываются: один
  // лишний запрос в редком случае даёт точное число на кнопке вместо
  // догадки, а пустая кнопка «показать отсмотренных» вовсе не появится.
  const includeSwiped = first(params.includeSwiped) === "true";
  const viewedMatchCount =
    recommendations.items.length === 0 && !includeSwiped
      ? ((
          await getUnionRecommendations({
            ...params,
            includeSwiped: "true",
            page: "1",
          }).catch(() => null)
        )?.total ?? 0)
      : 0;

  return (
    <>
      <BackgroundOrbs />
      <NoiseOverlay />
      {/* На телефоне верхний отступ вдвое меньше: там над сеткой и без него
          набирается три сотни пикселей служебной обвязки, а анкеты — то,
          ради чего человек пришёл. На десктопе места хватает. */}
      <main className="mx-auto max-w-6xl px-4 py-4 pb-28 md:py-8">
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

        <RecommendationFilters
          params={params}
          intentionCounts={recommendations.intentionCounts}
        />

        <HistoryResetBanner restoredCount={first(params.historyReset)} />

        <HiddenByOthersNote
          showAll={first(params.showAll) === "true"}
          count={recommendations.hiddenByOthers}
        />

        {recommendations.items.length === 0 ? (
          <RecommendationsEmpty
            params={params}
            narrowingFilterCount={countNarrowingFilters(params)}
            includeSwiped={includeSwiped}
            viewedMatchCount={viewedMatchCount}
          />
        ) : (
          <>
            {/* «Найдено» переехало в ряд кнопок режима — отдельной строкой
                оно съедало высоту. «Страница 1 из 1» не показываем вовсе:
                строка ничего не сообщает. */}
            {recommendations.totalPages > 1 && (
              <div className="mb-2 text-sm text-text-2">
                Страница {recommendations.page} из {recommendations.totalPages}.
              </div>
            )}
            <RecommendationsView
              items={recommendations.items}
              total={recommendations.total}
            />
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
    </>
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

/**
 * Что «показать всех» снять не может.
 *
 * Режим снимает мои собственные сужения — историю показов, желаемый возраст
 * партнёра, свой отбор по полу. Чужой выбор он не снимает: человек, который
 * ищет семью с определённым полом, не должен попадать в ленту тех, кому
 * заведомо не подходит. Но тогда слово «все» обязано быть проверяемым —
 * иначе счёт снова не сойдётся, и искать причину человек будет в фильтрах.
 */
function HiddenByOthersNote({
  showAll,
  count,
}: {
  showAll: boolean;
  count: number;
}) {
  if (!showAll || count <= 0) return null;
  return (
    <p className="mb-4 text-sm text-text-2">
      Показаны все, кроме {count === 1 ? "одной анкеты" : `${count} анкет`}:{" "}
      {count === 1 ? "её владелец ищет" : "их владельцы ищут"} семью с
      определённым полом, и {count === 1 ? "эта анкета" : "эти анкеты"} видна
      только тем, кто под это подходит.
    </p>
  );
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
