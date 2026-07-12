"use client";

import { useState } from "react";
import Link from "next/link";
import type { MotivationPostDto } from "@vedamatch/shared";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

const trackLabels = { universal: "Мудрость мира", vaishnava: "Вайшнавская мудрость" };

export function MotivationPostCard({ post }: { post: MotivationPostDto }) {
  const [favorite, setFavorite] = useState(post.isFavorite);
  const [pending, setPending] = useState(false);

  async function toggleFavorite() {
    setPending(true);
    const next = !favorite;
    setFavorite(next);
    try {
      const response = await fetch(`${API_URL}/motivation/posts/${post.id}/favorite`, {
        method: next ? "POST" : "DELETE",
        credentials: "include",
      });
      if (!response.ok) throw new Error(await response.text());
    } catch {
      setFavorite(!next);
    } finally {
      setPending(false);
    }
  }

  async function share() {
    const url = new URL(`/m/${post.slug}`, window.location.origin).toString();
    if (navigator.share) {
      await navigator.share({ title: post.title, text: post.text, url });
      return;
    }
    await navigator.clipboard.writeText(url);
  }

  return (
    <article className="overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={post.imageUrl} alt={post.title} className="aspect-[4/3] w-full object-cover" />
      <div className="p-5 sm:p-7">
        <div className="mb-3 flex flex-wrap items-center gap-2 text-xs font-medium">
          <span className="rounded-full bg-amber-100 px-3 py-1 text-amber-800 dark:bg-amber-900 dark:text-amber-200">
            {trackLabels[post.audienceTrack]}
          </span>
          <span className="text-zinc-500">{post.category}</span>
        </div>
        <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">{post.title}</h2>
        <p className="mt-3 whitespace-pre-line leading-7 text-zinc-700 dark:text-zinc-300">{post.text}</p>
        {post.attributionSpeaker && (
          <p className="mt-4 border-l-2 border-amber-400 pl-3 text-sm text-zinc-500">
            {post.attributionSpeaker}
            {post.attributionWork ? ` · ${post.attributionWork}` : ""}
            {post.attributionLocator ? ` · ${post.attributionLocator}` : ""}
          </p>
        )}
        <div className="mt-6 grid grid-cols-2 gap-2 sm:flex">
          <button type="button" onClick={toggleFavorite} disabled={pending} aria-pressed={favorite} className="rounded-xl border border-zinc-200 px-4 py-2 text-sm font-medium hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-700 dark:hover:bg-zinc-800">
            {favorite ? "★ В избранном" : "☆ В избранное"}
          </button>
          <button type="button" onClick={share} className="rounded-xl border border-zinc-200 px-4 py-2 text-sm font-medium hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800">Поделиться</button>
          <a href={post.storyImageUrl} download className="col-span-2 rounded-xl bg-amber-600 px-4 py-2 text-center text-sm font-medium text-white hover:bg-amber-700">Скачать для Stories</a>
          <Link href={`/m/${post.slug}`} className="col-span-2 rounded-xl px-4 py-2 text-center text-sm font-medium text-amber-700 hover:bg-amber-50 dark:text-amber-300 dark:hover:bg-amber-950">Открыть пост</Link>
        </div>
      </div>
    </article>
  );
}
