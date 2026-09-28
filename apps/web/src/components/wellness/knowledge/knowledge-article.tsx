"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { WellnessArticleDetail } from "@vedamatch/shared";
import {
  deleteWellnessArticle,
  getWellnessArticle,
  WellnessApiError,
} from "@/lib/wellness-api";
import { isAbort } from "@/lib/is-abort";
import { ArticleBody } from "./article-body";
import { ArticleForm } from "./article-form";
import { formatArticleDate } from "./knowledge-text";

const secondary =
  "rounded-xl border border-glass-brd px-3 py-2 text-sm text-text-0";

/** Статья «Знаний» с обложкой; админу — правка и удаление. */
export function KnowledgeArticle({
  id,
  canEdit,
}: {
  id: string;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [article, setArticle] = useState<WellnessArticleDetail | null>(null);
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    getWellnessArticle(id, controller.signal)
      .then(setArticle)
      .catch((cause) => {
        if (isAbort(cause)) return;
        if (cause instanceof WellnessApiError && cause.status === 404) {
          setMissing(true);
          return;
        }
        setError("Не удалось загрузить статью");
      });
    return () => controller.abort();
  }, [id]);

  if (error) {
    return (
      <p role="alert" className="text-sm text-magenta">
        {error}
      </p>
    );
  }
  if (missing) {
    return <p className="text-sm text-text-1">Такой статьи у нас нет.</p>;
  }
  if (!article) {
    return (
      <p role="status" className="text-sm text-text-1">
        Загружаем…
      </p>
    );
  }

  if (editing) {
    return (
      <ArticleForm
        categoryId={article.category.id}
        article={article}
        onCancel={() => setEditing(false)}
        onDone={(saved) => {
          setArticle(saved);
          setEditing(false);
        }}
      />
    );
  }

  const remove = () => {
    if (!window.confirm(`Удалить статью «${article.title}»?`)) return;
    deleteWellnessArticle(article.id)
      .then(() => router.push(`/wellness/knowledge/${article.category.slug}`))
      .catch((cause: Error) => window.alert(cause.message));
  };

  return (
    <article className="space-y-6">
      <Link
        href={`/wellness/knowledge/${article.category.slug}`}
        className="inline-block text-sm text-text-1 underline-offset-2 hover:underline"
      >
        ← {article.category.titleRu}
      </Link>

      {article.coverUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={article.coverUrl}
          alt=""
          className="max-h-96 w-full rounded-2xl object-cover"
        />
      )}

      <header>
        <h1 className="font-display text-2xl font-bold text-text-0 sm:text-3xl">
          {article.title}
        </h1>
        <p className="mt-2 text-xs text-text-2">
          {article.status === "draft"
            ? "Черновик — виден только администраторам"
            : formatArticleDate(article.publishedAt ?? article.createdAt)}
          {article.author && <> · {article.author.name}</>}
        </p>
        {canEdit && (
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setEditing(true)}
              className={secondary}
            >
              Править
            </button>
            <button type="button" onClick={remove} className={secondary}>
              Удалить
            </button>
          </div>
        )}
      </header>

      <ArticleBody body={article.body} />
    </article>
  );
}
