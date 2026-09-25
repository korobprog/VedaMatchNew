"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, Share2 } from "lucide-react";
import type { BlogPostDto } from "@vedamatch/shared";
import { BlogPostCard } from "./blog-post-card";

/**
 * Один пост целиком (VED-238): «нажатие на картинку или на заголовок должно
 * открывать данный конкретный пост и не должно открывать историю — другие
 * посты». Здесь и автор, и дата, и все действия — тот самый «полный
 * разворот», куда уехала подпись автора с главной. Текст развёрнут сразу:
 * человек пришёл читать именно этот пост.
 */
export function BlogPostView({ initial }: { initial: BlogPostDto }) {
  const router = useRouter();
  const [post, setPost] = useState(initial);
  const [copied, setCopied] = useState(false);

  /* «Поделиться» (VED-491) — справа от «Вся лента»: системное окно
     «Поделиться», а где его нет — ссылка в буфер обмена. */
  async function share() {
    const shown = post.repostOf ?? post;
    const url = `${window.location.origin}/blog/posts/${encodeURIComponent(post.id)}`;
    try {
      if (typeof navigator.share === "function") {
        await navigator.share({
          title: shown.title ?? "Блог-лента VedaMatch",
          url,
        });
        return;
      }
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Окно «Поделиться» закрыли — это не ошибка.
    }
  }

  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-2">
        <Link
          href="/blog"
          className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-glass-brd px-3 text-sm text-text-1 hover:border-cyan/60"
        >
          <ArrowLeft aria-hidden className="size-4" />
          Вся лента
        </Link>
        <button
          type="button"
          onClick={() => void share()}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-glass-brd px-3 text-sm text-text-1 hover:border-cyan/60"
        >
          {copied ? (
            <Check aria-hidden className="size-4" />
          ) : (
            <Share2 aria-hidden className="size-4" />
          )}
          {copied ? "Ссылка скопирована" : "Поделиться"}
        </button>
      </div>
      <BlogPostCard
        post={post}
        expanded
        onChanged={setPost}
        // Пост удалён — показывать больше нечего, возвращаем в ленту.
        onRemoved={() => router.replace("/blog")}
      />
    </>
  );
}
