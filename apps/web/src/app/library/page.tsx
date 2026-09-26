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
import { libraryMaterialsCount, t } from "@/components/library/i18n";

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
  const [tree, preferences, feed, communities, materials] = await Promise.all([
    getLibraryCategoryTree(),
    getLibraryPreferences(),
    getLibraryFeed(params),
    getLibraryCommunities(),
    // Счётчик «N материалов» у заголовка (VED-517) — без шлок: их сотни, и
    // они заслоняли бы число статей, видео и книг.
    getLibraryFeed({ excludeType: "shloka" }),
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
        {/* Заголовок, справа — сколько материалов (VED-517); пояснение —
            тем же тоном, что в Медиатеке. */}
        <div className="mb-4">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <h1 className="font-display text-2xl font-bold text-text-0">
              {t(locale, "service.title")}
            </h1>
            {materials && (
              <p className="text-sm text-text-2">
                {libraryMaterialsCount(locale, materials.total)}
              </p>
            )}
          </div>
          <p className="mt-1 text-sm text-text-2">{t(locale, "service.subtitle")}</p>
          <LineageStatus
            lineage={appliedLineage}
            settingsHref="#lineage-switch"
            className="mt-1"
          />
        </div>

        {/* Ряды кнопок по просьбе заказчика (VED-517): «Добавить»,
            «Избранное», язык — слева направо; ниже «Фильтры» и
            «Упорядочить». */}
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <Link
            href="/library/add"
            className="btn-mint inline-flex min-h-11 items-center justify-center rounded-xl px-4 text-sm font-semibold shadow-[0_0_12px_var(--vm-glow-mint)]"
          >
            {t(locale, "nav.add")}
          </Link>
          <Link
            href="/library/favorites"
            className="inline-flex min-h-11 items-center justify-center rounded-xl border border-glass-brd px-4 text-sm text-text-2 hover:text-text-0"
          >
            {t(locale, "bookmark.title")}
          </Link>
          <LocaleSwitch locale={locale} className="min-h-11 w-auto" />
        </div>
        <div className="mb-6 flex flex-wrap items-center gap-2">
          {/* Якорь `#lineage-switch` прежний: на него ведут «настроить» в
              подписи и подсказка выбрать линию со страниц рубрик. */}
          <div id="lineage-switch" className="scroll-mt-24">
            <LibraryLineageFilter
              locale={locale}
              applied={appliedLineage}
              preference={preferences?.lineage ?? null}
            />
          </div>
          {canOrganize && <LibraryOrganizeButton locale={locale} />}
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
