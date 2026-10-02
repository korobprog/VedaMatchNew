import Link from "next/link";
import { Mars, Star, Users, Venus, VenusAndMars } from "lucide-react";
import { redirect } from "next/navigation";
import { RecommendationsView } from "@/components/union/recommendations-view";
import { RecommendationsEmpty } from "@/components/union/recommendations-empty";
import { countNarrowingFilters } from "@/components/union/recommendation-empty-state";
import { RecommendationFilters } from "@/components/union/recommendation-filters";
import { UnionPageSizeSelect } from "@/components/union/page-size-select";
import {
  DEFAULT_UNION_PAGE_SIZE,
  SMALLEST_UNION_PAGE_SIZE,
  resolveUnionPageSize,
} from "@/components/union/page-size";
import {
  UnionToggleLink,
  effectiveGenderFilter,
  everyoneHref,
  oppositeGenderHref,
  oppositeGenderLabel,
  oppositeGenderOf,
  toggledHref,
} from "@/components/union/union-toggle-link";
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

  // «Показать всех», «Противоположный пол» и «Избранное» (VED-652,
  // VED-673): по умолчанию лента — анкеты противоположного пола.
  const path = "/union/recommendations";
  /* Состояние кнопок считается так же, как сервер считает выдачу (VED-673):
     кнопка раньше смотрела только на `gender`, а выдача — ещё и на `showAll`,
     и «Женщины» горела, пока в ленте были и мужчины. */
  const effectiveGender = effectiveGenderFilter(params, user.gender);
  const showEveryone = effectiveGender === "all";
  const showOpposite = effectiveGender === oppositeGenderOf(user.gender);
  const favoritesOnly = first(params.favoritesOnly) === "true";
  const toolbar = (
    <>
      <UnionToggleLink
        href={everyoneHref(path, params)}
        icon={<Users size={20} aria-hidden />}
        label="Показать всех"
        active={showEveryone}
      />
      {/* «Противоположный пол» (VED-673): мужчине — женский значок и надпись
          «Женщины», женщине — мужской и «Мужчины», как просил заказчик. */}
      <UnionToggleLink
        href={oppositeGenderHref(path, params, user.gender)}
        icon={
          user.gender === "male" ? (
            <Venus size={20} aria-hidden />
          ) : user.gender === "female" ? (
            <Mars size={20} aria-hidden />
          ) : (
            <VenusAndMars size={20} aria-hidden />
          )
        }
        label={oppositeGenderLabel(user.gender)}
        active={showOpposite}
      />
    </>
  );
  /* «Избранное» — не в основной группе, а правее «Крупнее» (VED-673): эти две
     кнопки заказчик просил поменять местами, поэтому «Избранное» рисуется
     последним в ряду и прижимается к правому краю. */
  const favoritesToggle = (
    <UnionToggleLink
      href={toggledHref(path, params, "favoritesOnly", "true")}
      icon={
        <Star
          size={20}
          aria-hidden
          fill={favoritesOnly ? "currentColor" : "none"}
        />
      }
      label="Избранное"
      active={favoritesOnly}
    />
  );
  // «Найдено» — в заголовке (VED-652), а не в ряду кнопок.
  const found =
    recommendations.items.length > 0
      ? `Найдено: ${recommendations.total}`
      : null;

  return (
    <>
      <BackgroundOrbs />
      <NoiseOverlay />
      {/* На телефоне верхний отступ вдвое меньше: там над сеткой и без него
          набирается три сотни пикселей служебной обвязки, а анкеты — то,
          ради чего человек пришёл. На десктопе места хватает. */}
      <main className="mx-auto max-w-6xl px-4 py-4 pb-28 md:py-8">
        <UnionTopBar title="Знакомства" aside={found} />
        <div className="mb-6 hidden md:block">
          <div className="flex items-baseline gap-4">
            <h1 className="font-display text-2xl font-bold text-text-0 sm:text-3xl">
              Знакомства
            </h1>
            {found && <span className="text-sm text-text-2">{found}</span>}
          </div>
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

        {recommendations.items.length === 0 ? (
          <>
            {/* Переключатели и над пустой выдачей: включённое «Избранное» без
              избранных иначе нечем было бы выключить. */}
            <div className="mb-4 flex items-center gap-2">
              {toolbar}
              <div className="ml-auto">{favoritesToggle}</div>
            </div>
            <RecommendationsEmpty
              params={params}
              narrowingFilterCount={countNarrowingFilters(params)}
              includeSwiped={includeSwiped}
              viewedMatchCount={viewedMatchCount}
            />
          </>
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
              toolbar={toolbar}
              toolbarEnd={favoritesToggle}
            />
            {/* «Показывать по» — рядом с перелистыванием, там и возникает
                вопрос. Не показываем, когда выбирать нечего: при выдаче
                меньше самой мелкой страницы любое значение даёт один и тот
                же экран. */}
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              {(recommendations.total > SMALLEST_UNION_PAGE_SIZE ||
                resolveUnionPageSize(params.pageSize) !==
                  DEFAULT_UNION_PAGE_SIZE) && (
                <UnionPageSizeSelect params={params} />
              )}
              <Pagination
                params={params}
                page={recommendations.page}
                totalPages={recommendations.totalPages}
              />
            </div>
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
    <div className="flex justify-center gap-3">
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
