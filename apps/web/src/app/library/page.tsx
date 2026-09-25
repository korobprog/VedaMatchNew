import Link from "next/link";
import { redirectToLogin } from "@/lib/require-user";
import type { Metadata } from "next";
import {
  isLineagePreference,
  resolveContentLineage,
} from "@vedamatch/shared";
import { getProfile } from "@/lib/api";
import { LineagePrompt } from "@/components/lineage-prompt";
import { LineageStatus } from "@/components/lineage-status";
import { LibraryLineageFilter } from "@/components/library/lineage-filter-chips";
import { LibraryOrganizeButton } from "@/components/library/organize-button";
import {
  getLibraryCategoryTree,
  getLibraryCommunities,
  getLibraryFeed,
  getLibraryPreferences,
} from "@/lib/library-api";
import { Header } from "@/components/header";
import { CategoryNavigator } from "@/components/library/category-navigator";
import { EntryFilters } from "@/components/library/entry-filters";
import { EntryList } from "@/components/library/entry-list";
import { LocaleSwitch } from "@/components/library/locale-switch";
import { t } from "@/components/library/i18n";

export const metadata: Metadata = {
  title: "Образование",
  description:
    "Общая база полезных материалов VedaMatch: статьи, видео, книги, курсы и каналы",
};

export default async function LibraryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getProfile();
  if (!user) redirectToLogin("/library");

  const params = await searchParams;
  const [tree, preferences, feed, communities] = await Promise.all([
    getLibraryCategoryTree(),
    getLibraryPreferences(),
    getLibraryFeed(params),
    getLibraryCommunities(),
  ]);
  const locale = preferences?.uiLanguage ?? "ru";
  const roots = tree ?? [];
  // Та же арифметика, что на сервере: явный `?lineage=` в адресе сильнее
  // настройки Образования, та — сильнее профиля. Подпись обязана говорить
  // ровно то, что применил API.
  const explicitLineage =
    typeof params.lineage === "string" && isLineagePreference(params.lineage)
      ? params.lineage
      : null;
  const appliedLineage = explicitLineage
    ? resolveContentLineage(null, explicitLineage)
    : // Без настройки — «Все» (VED-483), профиль фильтр не включает.
      resolveContentLineage(null, preferences?.lineage ?? null);
  // Кнопки линий видны всем (VED-395): у ищущего без настройки нажата «все
  // линии», и выдача та же, что была, — но сузить её он теперь может в одно
  // касание, а не через профиль.

  // «Упорядочить» — у тех, кто может переставлять рубрики.
  const canOrganize = roots.some((root) => root.canMove);

  return (
    <div className="relative min-h-dvh bg-bg-0">
      <Header user={user} />
      <main className="mx-auto max-w-5xl px-4 py-8 pb-24">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-bold text-text-0">
              {t(locale, "service.title")}
            </h1>
            <p className="text-text-1">{t(locale, "service.subtitle")}</p>
            <LineageStatus
              lineage={appliedLineage}
              settingsHref="#lineage-switch"
              className="mt-1"
            />
          </div>
          {/* Порядок по просьбе заказчика (VED-449): «Создать пост»,
              «Фильтры», «Избранное», язык, «Упорядочить». На телефоне —
              ровная сетка одинаковых ячеек (VED-483: «чтобы были ровно в
              один, два ряда»): два столбца, а у редакции, у которой есть
              «Упорядочить», — три, и та занимает две ячейки второго ряда. */}
          <div
            className={`grid w-full gap-2 sm:flex sm:w-auto sm:flex-wrap sm:items-center ${
              canOrganize ? "grid-cols-3" : "grid-cols-2"
            }`}
          >
            <Link
              href="/library/add"
              className="btn-mint inline-flex min-h-11 items-center justify-center rounded-xl px-3 text-sm font-semibold shadow-[0_0_12px_var(--vm-glow-mint)] sm:px-4"
            >
              {t(locale, "nav.add")}
            </Link>
            {/* Якорь `#lineage-switch` прежний: на него ведут «настроить» в
                подписи и подсказка выбрать линию со страниц рубрик. */}
            <div id="lineage-switch" className="scroll-mt-24">
              <LibraryLineageFilter
                locale={locale}
                applied={appliedLineage}
                preference={preferences?.lineage ?? null}
              />
            </div>
            <Link
              href="/library/favorites"
              className="inline-flex min-h-11 items-center justify-center rounded-xl border border-glass-brd px-3 text-sm text-text-2 hover:text-text-0 sm:px-4"
            >
              {t(locale, "bookmark.title")}
            </Link>
            <LocaleSwitch locale={locale} className="min-h-11 w-full sm:w-auto" />
            {canOrganize && (
              <LibraryOrganizeButton locale={locale} className="col-span-2" />
            )}
          </div>
        </div>

        {user && (
          <LineagePrompt
            user={user}
            serviceName="Образования"
            settingsHref="#lineage-switch"
            settingsLabel="кнопкой «Фильтры»"
          />
        )}

        <CategoryNavigator
          locale={locale}
          categories={roots}
          tree={roots}
          canOrganize={canOrganize}
          root
          organizeInToolbar
        />
        <EntryFilters
          locale={locale}
          categories={[]}
          communities={communities ?? []}
        />

        {feed && (
          <EntryList
            // Линия — в ключе: кнопка линии меняет настройку, а не адрес, и
            // без неё лента после router.refresh() держала бы старую выдачу
            // в своём состоянии — подпись новая, материалы прежние.
            key={`${JSON.stringify(params)}|${appliedLineage ?? "all"}`}
            initialFeed={feed}
            locale={locale}
            query={params}
            lineageFiltered={appliedLineage !== null}
          />
        )}
      </main>
    </div>
  );
}
