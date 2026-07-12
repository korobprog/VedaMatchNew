"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { MotivationAdminPostDto } from "@vedamatch/shared";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const statusLabels: Record<MotivationAdminPostDto["status"], string> = { draft: "В очереди", generating: "Генерируется", published: "Опубликовано", failed: "Ошибка", hidden: "Скрыто" };

export function MotivationAdminControls({ posts }: { posts: MotivationAdminPostDto[] | null }) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!posts?.some((post) => post.status === "draft" || post.status === "generating")) return;
    const timer = window.setInterval(() => router.refresh(), 5_000);
    return () => window.clearInterval(timer);
  }, [posts, router]);

  async function run(key: string, path: string) {
    setPending(key);
    setError(null);
    try {
      const response = await fetch(`${API_URL}${path}`, { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: path.endsWith("/generate") ? "{}" : undefined });
      if (!response.ok) throw new Error((await response.text()) || `Ошибка API ${response.status}`);
      router.refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Не удалось выполнить действие");
    } finally { setPending(null); }
  }

  if (!posts) return <p className="rounded-xl bg-red-50 p-4 text-red-800">Не удалось загрузить публикации Motivation.</p>;
  return <>
    <div className="mt-6 flex flex-wrap items-center gap-3"><button disabled={pending !== null} onClick={() => run("daily", "/admin/motivation/generate")} className="rounded-xl bg-amber-600 px-5 py-3 font-medium text-white disabled:opacity-50">{pending === "daily" ? "Запускаем…" : "Сгенерировать на сегодня"}</button>{error && <p role="alert" className="text-sm text-red-700">{error}</p>}</div>
    <div className="mt-6 space-y-3">{posts.map((post) => <article key={post.id} className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start"><div><p className="text-xs uppercase text-amber-600">{post.profileType} · {post.audienceTrack}</p><h2 className="mt-1 font-semibold text-zinc-900 dark:text-zinc-100">{post.title || post.slug}</h2><p className="mt-1 text-sm text-zinc-500">{post.contentDate} · {post.category}</p><p className="mt-2 text-sm text-zinc-700 dark:text-zinc-300">{statusLabels[post.status]} · этап: {post.generationStage} · попыток: {post.attemptCount}</p>{post.generationErrorCode && <p className="mt-2 text-sm text-red-700">{post.generationErrorCode}</p>}</div><div className="flex flex-wrap gap-2">{post.status === "published" && <a href={`/m/${post.slug}`} className="rounded-lg border border-amber-300 px-3 py-2 text-sm text-amber-700">Открыть</a>}<button disabled={pending !== null || post.status === "generating"} onClick={() => run(post.id, `/admin/motivation/posts/${post.id}/regenerate`)} className="rounded-lg bg-zinc-900 px-3 py-2 text-sm text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900">{pending === post.id ? "Запускаем…" : "Перегенерировать"}</button></div></div></article>)}</div>
  </>;
}
