import Link from "next/link";
import { notFound } from "next/navigation";
import { redirectToLogin } from "@/lib/require-user";
import { effectiveLineageIds, isLineagePreference } from "@vedamatch/shared";
import { getProfile } from "@/lib/api";
import { LineagePrompt } from "@/components/lineage-prompt";
import {
  getLibraryCategoryPage,
  getLibraryCategoryTree,
  getLibraryCommunities,
  getLibraryFeed,
  getLibraryPreferences,
  getLibraryShlokaList,
  getLibraryShlokaSourceLines,
  getLibraryShlokaSources,
} from "@/lib/library-api";
import { Header } from "@/components/header";
import { BackLink } from "@/components/library/back-link";
import { LibraryBookmarksDialog } from "@/components/library/bookmarks-dialog";
import { CategoryBreadcrumbs } from "@/components/library/category-breadcrumbs";
import { CategoryNavigator } from "@/components/library/category-navigator";
import { CategoryOrderMenu } from "@/components/library/category-order-menu";
import {
  CATEGORY_ORDER_PARAM,
  isAlphabeticalOrder,
  sortCategoriesForView,
} from "@/components/library/category-order";
import { headerEntriesCount } from "@/components/library/category-tree";
import { CategoryTitleEdit } from "@/components/library/category-title-edit";
import { categoryPageTitle } from "@/components/library/category-page-title";
import { EntryFilters } from "@/components/library/entry-filters";
import { EntryFilterMenu } from "@/components/library/entry-filter-menu";
import { LibraryContents } from "@/components/library/library-contents";
import { EntryList } from "@/components/library/entry-list";
import {
  MATERIAL_FILTERS_HREF,
  MATERIAL_FILTERS_LABEL,
  profileMaterialFilters,
} from "@/lib/material-filters";
import { LineageInfoButton } from "@/components/lineage-info-button";
import { shlokaSectionMode } from "@/components/library/shloka/shloka-mode";
import { ShlokaRootPanel } from "@/components/library/shloka/shloka-root-panel";
import { ShlokaSourcePanel } from "@/components/library/shloka/shloka-source-panel";
import { ShlokaSourceFolders } from "@/components/library/shloka/shloka-source-folders";
import { ShlokaFolderList } from "@/components/library/shloka/shloka-folder-list";
import { folderKeyFromQuery } from "@/components/library/shloka/shloka-folders";
import { st } from "@/components/library/shloka/shloka-text";
import {
  categoryPageSummary,
  pickLocalized,
  t,
} from "@/components/library/i18n";

/**
 * Страница рубрики — одна на все уровни дерева.
 *
 * Адрес плоский: `/library/<slug>` не зависит от места в дереве, поэтому
 * перемещение рубрики не превращает чужие ссылки и закладки в 404. Путь
 * показывают хлебные крошки, а не адресная строка.
 */
export default async function LibraryCategoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getProfile();
  if (!user) {
    const { slug } = await params;
    redirectToLogin(`/library/${slug}`);
  }

  const { slug } = await params;
  const rawQuery = await searchParams;
  // Порядок плиток подрубрик (VED-573) — дело страницы, а не ленты: в запрос
  // материалов он не уходит и ленту не пересобирает.
  const alphabetical = isAlphabeticalOrder(rawQuery[CATEGORY_ORDER_PARAM]);
  const query = Object.fromEntries(
    Object.entries(rawQuery).filter(([key]) => key !== CATEGORY_ORDER_PARAM),
  );
  // Материалы вложенных рубрик показываем по умолчанию: иначе вложение
  // прятало бы контент — рубрику убрали внутрь, и лента родителя опустела.
  const withDescendants = query.withDescendants !== "false";

  const explicitLineage =
    typeof query.lineage === "string" && isLineagePreference(query.lineage)
      ? query.lineage
      : null;
  // Авторы чужих линий скрыты вместе с их материалами (VED-621): и среди
  // подрубрик, и в дереве навигации. Сама рубрика по ссылке открывается.
  const categoryView = { filtered: true, lineage: explicitLineage };
  const [page, tree, preferences, communities, shlokas] = await Promise.all([
    getLibraryCategoryPage(slug, categoryView),
    getLibraryCategoryTree(categoryView),
    getLibraryPreferences(),
    getLibraryCommunities(),
    // Шлоки рубрики по порядку стихов (VED-386). Для обычной рубрики —
    // пустой ответ, и страница остаётся прежней.
    getLibraryShlokaList(slug).catch(() => null),
  ]);

  if (!page) notFound();

  const shlokaMode = shlokaSectionMode({
    category: page.category,
    ancestors: page.ancestors,
    shlokaTotal: shlokas?.total ?? 0,
  });
  // Папка-источник рубрики «Шлоки» (VED-465) открывается на этой же
  // странице: `?source=<ключ>`.
  const folderKey =
    shlokaMode === "root" ? folderKeyFromQuery(query.source) : null;
  // В окне источника шлоки стоят списком выше, а лента ниже — остальные
  // материалы раздела, без повтора тех же шлок. В корне «Шлок» так же: сами
  // шлоки разложены по папкам (VED-465).
  const feedQuery = {
    ...Object.fromEntries(
      Object.entries(query).filter(([key]) => key !== "source"),
    ),
    categorySlug: slug,
    withDescendants: withDescendants ? "true" : "false",
    ...(shlokaMode !== null ? { excludeType: "shloka" } : {}),
  };
  const [feed, sources, folder] = await Promise.all([
    // В папке ленты нет — только её шлоки.
    folderKey ? Promise.resolve(null) : getLibraryFeed(feedQuery),
    shlokaMode === "root" && !folderKey
      ? getLibraryShlokaSources(slug).catch(() => null)
      : Promise.resolve(null),
    folderKey
      ? getLibraryShlokaSourceLines(slug, folderKey).catch(() => null)
      : Promise.resolve(null),
  ]);
  if (folderKey && !folder) notFound();

  const locale = preferences?.uiLanguage ?? "ru";
  // Линии — из «Фильтров материалов» с главной (VED-617), явный `?lineage=`
  // сильнее; своей кнопки линии у Образования нет (VED-628). Та же
  // арифметика, что на сервере.
  const appliedLineageIds = effectiveLineageIds(
    explicitLineage,
    profileMaterialFilters(user ?? null),
  );
  // Линия — в ключе ленты: «Фильтры материалов» меняют профиль, а не адрес,
  // и без неё лента держала бы прежнюю выдачу.
  const lineageKey = appliedLineageIds?.join(",") ?? "all";
  // Фильтр ленты применён (VED-396) — число в шапке следует за лентой.
  // В окне шлок лента без самих шлок, и её число шапке не годится.
  const headerFiltered =
    shlokaMode === null &&
    (appliedLineageIds !== null ||
      typeof query.type === "string" ||
      typeof query.language === "string");
  const { category, ancestors, children } = page;
  const title = pickLocalized(locale, {
    ru: category.titleRu,
    en: category.titleEn,
  });
  // Страница автора (VED-521) — рубрика без подрубрик внутри раздела:
  // «Проповедники → Ари Мардан Прабху». Панели фильтров там нет: тип
  // материала — значком в ряду действий. «Упорядочить» у автора убрано
  // (VED-573): порядок выбирают в списке авторов, а не в ленте одного.
  // Раздел, где фильтры линий спрятали всех авторов (VED-621), — всё ещё
  // раздел, а не автор.
  const authorPage =
    children.length === 0 &&
    !page.hiddenChildrenCount &&
    ancestors.length > 0 &&
    shlokaMode === null;

  return (
    <div className="relative min-h-dvh bg-bg-0">
      <Header user={user} />
      <main className="mx-auto max-w-5xl px-4 py-8 pb-24">
        {/* «Назад» и путь — одной строкой (VED-511): крошки справа, без
            последней — её имя стоит заголовком строкой ниже. */}
        <div className="-mt-3 mb-2 flex flex-wrap items-center justify-between gap-x-3">
          <BackLink locale={locale} fallbackHref="/library" className="" />
          <CategoryBreadcrumbs
            locale={locale}
            ancestors={ancestors}
            current={title}
            hideCurrent
            className=""
          />
        </div>

        {/* Число подразделов — в строке заголовка, у правого края (VED-511).

            То же одно число, что и в плитке: раздел — свои подразделы,
            подраздел — свои материалы. Голое «3 материалов» над лентой
            раздела, у которого своих материалов нет, читалось как «здесь
            три» — а все три лежали в подразделах. */}
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          {/* Свой заголовок страницы (VED-394) — только здесь; путь выше и
              плитка у родителя держат название рубрики. */}
          <h1 className="font-display text-2xl font-bold text-text-0">
            {categoryPageTitle(locale, category)}
          </h1>
          <p className="text-sm text-text-2">
            {categoryPageSummary(
              locale,
              headerEntriesCount(category, {
                active: headerFiltered,
                feedTotal: feed?.total ?? null,
              }),
            )}
          </p>
        </div>

        {/* Ряд действий (VED-511): «Добавить», а справа значками — «Закладки»,
            «Редактировать», «Упорядочить», в этом порядке. Подписи у значков
            — в `aria-label` и подсказке. Кнопки — прямо в ряду, без обёртки:
            форма правки названия встаёт под ним на всю ширину. Ряд — точка
            отсчёта для меню фильтров: оно раскрывается у его правого края. */}
        <div className="relative mb-4 flex flex-wrap items-center gap-2">
          <Link
            href={`/library/add?category=${encodeURIComponent(category.slug)}`}
            className="btn-mint inline-flex min-h-11 items-center rounded-xl px-4 text-sm font-semibold shadow-[0_0_12px_var(--vm-glow-mint)]"
          >
            {t(locale, "nav.add")}
          </Link>
          {authorPage ? (
            <>
              {/* У автора слева направо (VED-521, второй круг): «Содержание»
                  значком, «Тип материала», «Линия». Список «Содержания»
                  раскрывается под рядом (VED-538).

                  Значки встают сразу за «Добавить», без отступа к правому
                  краю (VED-614, по скриншоту заказчика): пустая распорка
                  `ml-auto` съедала ещё один `gap`, и на телефоне последняя
                  кнопка правки переносилась на вторую строку.

                  «Язык» с подписью «Все» убран (VED-573): на телефоне он
                  один переносился на вторую строку и отодвигал ленту вниз.

                  «Упорядочить» здесь нет (VED-573): заказчик просил его в
                  списке всех авторов, а у отдельного автора — убрать. */}
              <LibraryContents
                locale={locale}
                categorySlug={category.slug}
                iconOnly
              />
              <EntryFilterMenu kind="type" locale={locale} />
              {/* «Линия» с домиком (VED-616) — всем: к какой линии автор. */}
              <LineageInfoButton
                subjects={[
                  {
                    title: t(locale, "lineage.infoAuthor"),
                    lineage: category.lineage ?? null,
                    emptyLabel: t(locale, "lineage.infoAuthorNone"),
                  },
                ]}
                buttonClassName="rounded-xl"
              />
              {/* Правка названия (VED-614): сначала — в общем списке
                  (плитка у родителя, путь, чипы), последней — заголовок
                  только этой страницы. Порядок — по скриншоту заказчика. */}
              <CategoryTitleEdit
                locale={locale}
                category={category}
                iconOnly
                target="title"
              />
              <CategoryTitleEdit locale={locale} category={category} iconOnly />
            </>
          ) : (
            <>
              {/* «Закладки» (VED-511). Раньше вела на
                  страницу «Избранное» — ту же ленту карточек; теперь
                  открывает окно со списком названий всех закладок
                  Образования (VED-539). */}
              <LibraryBookmarksDialog locale={locale} className="ml-auto" />
              {/* Кнопки «Фильтры» по линиям здесь нет (VED-628): линии
                  выбирают «Фильтры материалов» на главной. */}
              <CategoryTitleEdit locale={locale} category={category} iconOnly />
              {/* Рядом — название в общем списке (VED-614): плитка у
                  родителя, путь, чипы. */}
              <CategoryTitleEdit
                locale={locale}
                category={category}
                iconOnly
                target="title"
              />
              {/* «Упорядочить» (VED-573) — меню для всех: «Свой порядок»
                  или «По алфавиту». У админа в нём же «Редактировать
                  порядок» — прежнее перетаскивание дерева. */}
              {(children.length > 1 || category.canMove) && (
                <CategoryOrderMenu
                  locale={locale}
                  canOrganize={category.canMove}
                />
              )}
            </>
          )}
        </div>

        {user && !authorPage && (
          <LineagePrompt
            user={user}
            serviceName="Образования"
            settingsHref={MATERIAL_FILTERS_HREF}
            settingsLabel={MATERIAL_FILTERS_LABEL}
          />
        )}

        {folder ? (
          <ShlokaFolderList
            locale={locale}
            categorySlug={category.slug}
            data={folder}
          />
        ) : (
          <CategoryNavigator
            locale={locale}
            categories={sortCategoriesForView(children, locale, alphabetical)}
            tree={tree ?? []}
            activeSlug={category.slug}
            canOrganize={category.canMove && !authorPage}
            organizeInToolbar
          />
        )}

        {sources && (
          <ShlokaSourceFolders
            locale={locale}
            categorySlug={category.slug}
            sources={sources}
          />
        )}

        {shlokaMode === "root" && !folder && (
          <ShlokaRootPanel
            locale={locale}
            tree={tree ?? []}
            categorySlug={category.slug}
          />
        )}

        {shlokaMode === "source" && shlokas && (
          <ShlokaSourcePanel
            locale={locale}
            categorySlug={category.slug}
            initial={shlokas}
          />
        )}

        {folder ? null : shlokaMode !== null ? (
          // Прочие материалы раздела — только если они есть: пустая лента
          // под списком шлок читалась бы как «здесь ничего нет».
          feed &&
          feed.total > 0 && (
            <section aria-labelledby="other-materials">
              <h2
                id="other-materials"
                className="mb-3 font-display text-lg font-bold text-text-0"
              >
                {st(locale, "section.otherMaterials")}
              </h2>
              <EntryList
                key={`${JSON.stringify(feedQuery)}|${lineageKey}`}
                initialFeed={feed}
                locale={locale}
                query={feedQuery}
                lineageFiltered={appliedLineageIds !== null}
              />
            </section>
          )
        ) : (
          <>
            {/* «Со вложенными / Только здесь» убран (VED-649): раздел
                всегда показывает и материалы подразделов. */}
            {/* У автора панели фильтров нет (VED-521): тип и порядок —
                значками выше. */}
            {!authorPage && (
              <EntryFilters
                locale={locale}
                categories={children}
                communities={communities ?? []}
              />
            )}

            {feed && (
              <EntryList
                key={`${JSON.stringify({ ...query, categorySlug: slug })}|${lineageKey}`}
                initialFeed={feed}
                locale={locale}
                query={{ ...query, categorySlug: slug }}
                lineageFiltered={appliedLineageIds !== null}
                // Родительские рубрики уже названы крошками, и их чипы на
                // карточках лишние (VED-573): у автора «Проповедники»
                // выталкивали его имя на отдельную строку.
                hiddenCategorySlugs={ancestors.map((item) => item.slug)}
              />
            )}
          </>
        )}
      </main>
    </div>
  );
}
