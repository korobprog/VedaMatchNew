"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type {
  WellnessArticleCard,
  WellnessKnowledgeCategoryPage,
} from "@vedamatch/shared";
import {
  deleteWellnessKnowledgeCategory,
  getWellnessKnowledgeArticles,
  getWellnessKnowledgeCategory,
  WellnessApiError,
} from "@/lib/wellness-api";
import { isAbort } from "@/lib/is-abort";
import { ArticleForm } from "./article-form";
import { CategoryForm } from "./category-form";
import {
  articleCountLabel,
  formatArticleDate,
  hasMoreArticles,
} from "./knowledge-text";

type Mode = "subcategory" | "edit" | "article" | null;

const secondary =
  "rounded-xl border border-glass-brd px-3 py-2 text-sm text-text-0";

function ArticleCard({ article }: { article: WellnessArticleCard }) {
  return (
    <Link
      href={`/wellness/knowledge/article/${article.id}`}
      className="flex h-full flex-col overflow-hidden rounded-2xl border border-glass-brd bg-glass"
    >
      {article.coverUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={article.coverUrl}
          alt=""
          loading="lazy"
          className="h-40 w-full object-cover"
        />
      ) : (
        <span aria-hidden className="block h-2 w-full bg-magenta/40" />
      )}
      <span className="flex flex-1 flex-col p-4">
        <span className="font-display text-lg font-bold text-text-0">
          {article.title}
        </span>
        {article.excerpt && (
          <span className="mt-1 line-clamp-3 text-sm text-text-1">
            {article.excerpt}
          </span>
        )}
        <span className="mt-auto pt-3 text-xs text-text-2">
          {article.status === "draft"
            ? "Черновик"
            : formatArticleDate(article.publishedAt ?? article.createdAt)}
        </span>
      </span>
    </Link>
  );
}

/** Рубрика «Знаний»: подрубрики и статьи карточками, админу — правка. */
export function KnowledgeCategory({
  slug,
  canEdit,
}: {
  slug: string;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [page, setPage] = useState<WellnessKnowledgeCategoryPage | null>(null);
  const [articles, setArticles] = useState<WellnessArticleCard[]>([]);
  const [listPage, setListPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [more, setMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>(null);

  const load = useCallback(
    (signal?: AbortSignal) =>
      Promise.all([
        getWellnessKnowledgeCategory(slug, signal),
        getWellnessKnowledgeArticles(slug, 1, signal),
      ])
        .then(([category, list]) => {
          setPage(category);
          setArticles(list.items);
          setListPage(1);
          setTotal(list.total);
          setMore(hasMoreArticles(list));
        })
        .catch((cause) => {
          if (isAbort(cause)) return;
          if (cause instanceof WellnessApiError && cause.status === 404) {
            setMissing(true);
            return;
          }
          setError("Не удалось загрузить рубрику");
        }),
    [slug],
  );

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  if (error) {
    return (
      <p role="alert" className="text-sm text-magenta">
        {error}
      </p>
    );
  }
  if (missing) {
    return <p className="text-sm text-text-1">Такой рубрики у нас нет.</p>;
  }
  if (!page) {
    return (
      <p role="status" className="text-sm text-text-1">
        Загружаем…
      </p>
    );
  }

  const { category, breadcrumbs, children } = page;
  const parent =
    breadcrumbs.length > 1 ? breadcrumbs[breadcrumbs.length - 2] : null;
  const canNest = breadcrumbs.length < 3;

  const loadMore = () => {
    setLoadingMore(true);
    getWellnessKnowledgeArticles(slug, listPage + 1)
      .then((list) => {
        setArticles((current) => [...current, ...list.items]);
        setListPage(list.page);
        setTotal(list.total);
        setMore(hasMoreArticles(list));
      })
      .catch(() => setError("Не удалось загрузить статьи"))
      .finally(() => setLoadingMore(false));
  };

  const removeCategory = () => {
    if (!window.confirm(`Удалить рубрику «${category.titleRu}»?`)) return;
    deleteWellnessKnowledgeCategory(category.id)
      .then(() =>
        router.push(
          parent ? `/wellness/knowledge/${parent.slug}` : "/wellness/knowledge",
        ),
      )
      .catch((cause: Error) => window.alert(cause.message));
  };

  return (
    <div className="space-y-8">
      <nav aria-label="Путь по рубрикам" className="text-sm text-text-1">
        <ol className="flex flex-wrap items-center gap-1">
          <li>
            <Link
              href="/wellness/knowledge"
              className="underline-offset-2 hover:underline"
            >
              Знания
            </Link>
          </li>
          {breadcrumbs.map((crumb, index) => (
            <li key={crumb.slug} className="flex items-center gap-1">
              <span aria-hidden className="text-text-2">
                /
              </span>
              {index === breadcrumbs.length - 1 ? (
                <span aria-current="page" className="text-text-0">
                  {crumb.titleRu}
                </span>
              ) : (
                <Link
                  href={`/wellness/knowledge/${crumb.slug}`}
                  className="underline-offset-2 hover:underline"
                >
                  {crumb.titleRu}
                </Link>
              )}
            </li>
          ))}
        </ol>
      </nav>

      <header>
        <h1 className="font-display text-2xl font-bold text-text-0 sm:text-3xl">
          {category.titleRu}
        </h1>
        {category.descriptionRu && (
          <p className="mt-1 text-sm text-text-1">{category.descriptionRu}</p>
        )}
        {canEdit && (
          <div className="mt-4 flex flex-wrap gap-2">
            {canNest && (
              <button
                type="button"
                onClick={() => setMode("subcategory")}
                className={secondary}
              >
                Добавить подрубрику
              </button>
            )}
            <button
              type="button"
              onClick={() => setMode("article")}
              className={secondary}
            >
              Добавить статью
            </button>
            <button
              type="button"
              onClick={() => setMode("edit")}
              className={secondary}
            >
              Править рубрику
            </button>
            {parent && (
              <button
                type="button"
                onClick={removeCategory}
                className={secondary}
              >
                Удалить рубрику
              </button>
            )}
          </div>
        )}
      </header>

      {canEdit && mode === "subcategory" && (
        <CategoryForm
          parentId={category.id}
          onCancel={() => setMode(null)}
          onDone={() => {
            setMode(null);
            void load();
          }}
        />
      )}
      {canEdit && mode === "edit" && (
        <CategoryForm
          category={category}
          onCancel={() => setMode(null)}
          onDone={() => {
            setMode(null);
            void load();
          }}
        />
      )}
      {canEdit && mode === "article" && (
        <ArticleForm
          categoryId={category.id}
          onCancel={() => setMode(null)}
          onDone={(saved) =>
            router.push(`/wellness/knowledge/article/${saved.id}`)
          }
        />
      )}

      {children.length > 0 && (
        <section aria-labelledby="knowledge-subcategories">
          <h2
            id="knowledge-subcategories"
            className="font-display text-lg font-bold text-text-0"
          >
            Подрубрики
          </h2>
          <ul className="mt-3 grid gap-3 sm:grid-cols-2">
            {children.map((child) => (
              <li key={child.id}>
                <Link
                  href={`/wellness/knowledge/${child.slug}`}
                  className="block h-full rounded-2xl border border-glass-brd bg-glass p-4"
                >
                  <span className="block font-display font-bold text-text-0">
                    {child.titleRu}
                  </span>
                  {child.descriptionRu && (
                    <span className="mt-1 block text-sm text-text-1">
                      {child.descriptionRu}
                    </span>
                  )}
                  <span className="mt-2 block text-xs text-text-2">
                    {articleCountLabel(child.articleCount)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="knowledge-articles">
        <h2
          id="knowledge-articles"
          className="font-display text-lg font-bold text-text-0"
        >
          Статьи
        </h2>
        {articles.length === 0 ? (
          <p className="mt-2 text-sm text-text-1">
            {children.length
              ? "Статьи лежат в подрубриках."
              : "Статей здесь пока нет."}
          </p>
        ) : (
          <>
            <p className="mt-1 text-xs text-text-2">
              {articleCountLabel(total)}
            </p>
            <ul className="mt-3 grid gap-3 sm:grid-cols-2">
              {articles.map((article) => (
                <li key={article.id}>
                  <ArticleCard article={article} />
                </li>
              ))}
            </ul>
          </>
        )}
        {more && (
          <button
            type="button"
            onClick={loadMore}
            disabled={loadingMore}
            className={`mt-4 ${secondary} disabled:opacity-50`}
          >
            {loadingMore ? "Загружаем…" : "Показать ещё"}
          </button>
        )}
      </section>
    </div>
  );
}
