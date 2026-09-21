"use client";

import { useState } from "react";
import Link from "next/link";
import { Copy, Check, Repeat2, Trash2, Pin } from "lucide-react";
import type { BlogPostDto } from "@vedamatch/shared";
import { copyText } from "@/lib/copy-text";
import { buildBlogPostCopy } from "@/lib/blog-copy";
import {
  BlogApiError,
  deleteBlogPost,
  repostBlogPost,
  setBlogPostPinned,
} from "@/lib/blog-client-api";
import { BlogImages } from "./blog-images";
import { BlogLifetimeControl } from "./blog-lifetime-control";
import { blogPostDate } from "./blog-format";

/**
 * Карточка поста блог-ленты.
 *
 * Картинка первой и во всю ширину — по чек-листу VED-238: «в ленте должно
 * быть видно в первую очередь прикреплённая картинка/картинки крупным
 * планом, а также заголовок». Поэтому подпись автора идёт над картинкой
 * одной строкой, а текст — под ней, как в Instagram.
 */
export function BlogPostCard({
  post,
  onChanged,
  onRemoved,
}: {
  post: BlogPostDto;
  onChanged?: (post: BlogPostDto) => void;
  onRemoved?: (id: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const source = post.repostOf;

  async function copy() {
    const text = buildBlogPostCopy(post, { origin: window.location.origin });
    const ok = await copyText(text);
    if (!ok) {
      setError("Буфер обмена недоступен.");
      return;
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  async function repost() {
    setPending(true);
    setError(null);
    try {
      await repostBlogPost(post.id, { text: "" });
      onChanged?.({ ...post, repostCount: post.repostCount + 1 });
    } catch (cause) {
      setError(cause instanceof BlogApiError ? cause.message : "Не вышло.");
    } finally {
      setPending(false);
    }
  }

  async function remove() {
    setPending(true);
    setError(null);
    try {
      await deleteBlogPost(post.id);
      onRemoved?.(post.id);
    } catch (cause) {
      setError(cause instanceof BlogApiError ? cause.message : "Не вышло.");
      setPending(false);
    }
  }

  async function togglePin() {
    setPending(true);
    setError(null);
    try {
      onChanged?.(await setBlogPostPinned(post.id, !post.pinned));
    } catch (cause) {
      setError(cause instanceof BlogApiError ? cause.message : "Не вышло.");
    } finally {
      setPending(false);
    }
  }

  return (
    <article className="overflow-hidden rounded-2xl border border-glass-brd bg-glass">
      <header className="flex items-center gap-3 px-4 py-3">
        <Link
          href={`/blog/authors/${post.author.id}`}
          className="flex min-w-0 items-center gap-3"
        >
          <Avatar name={post.author.name} url={post.author.avatarUrl} />
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold text-text-0">
              {post.author.name}
            </span>
            <span className="block text-[11px] text-text-2">
              {blogPostDate(post.createdAt)}
              {post.pinned && " · закреплено"}
              {!post.inFeed && " · вне ленты"}
            </span>
          </span>
        </Link>
      </header>

      {source ? (
        <div className="mx-4 mb-3 rounded-xl border border-glass-brd bg-bg-1 p-3">
          <p className="mb-2 text-[11px] text-text-2">
            Репост:{" "}
            <Link
              href={`/blog/authors/${source.author.id}`}
              className="underline underline-offset-2"
            >
              {source.author.name}
            </Link>
          </p>
          {source.title && (
            <p className="mb-1 font-display text-base text-text-0">
              {source.title}
            </p>
          )}
          <BlogImages images={source.images} alt={source.title} compact />
          {source.text && (
            <p className="mt-2 whitespace-pre-line text-sm leading-6 text-text-1">
              {source.text}
            </p>
          )}
        </div>
      ) : (
        <>
          <BlogImages images={post.images} alt={post.title} />
          {post.title && (
            <p className="px-4 pt-3 font-display text-lg leading-snug text-text-0">
              {post.title}
            </p>
          )}
        </>
      )}

      {post.text && (
        <p className="whitespace-pre-line px-4 pt-2 text-sm leading-6 text-text-1">
          {post.text}
        </p>
      )}

      <footer className="flex flex-wrap items-center gap-2 px-4 py-3">
        <button
          type="button"
          onClick={copy}
          className="inline-flex items-center gap-1.5 rounded-lg border border-glass-brd px-2.5 py-1.5 text-xs text-text-1 hover:border-cyan/60"
        >
          {copied ? (
            <Check aria-hidden className="size-3.5" />
          ) : (
            <Copy aria-hidden className="size-3.5" />
          )}
          {copied ? "Скопировано" : "Копировать"}
        </button>
        <button
          type="button"
          onClick={repost}
          disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-lg border border-glass-brd px-2.5 py-1.5 text-xs text-text-1 hover:border-cyan/60 disabled:opacity-60"
        >
          <Repeat2 aria-hidden className="size-3.5" />
          Репост
          {post.repostCount > 0 && (
            <span className="text-text-2">{post.repostCount}</span>
          )}
        </button>
        {post.canModerate && (
          <button
            type="button"
            onClick={togglePin}
            disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-lg border border-glass-brd px-2.5 py-1.5 text-xs text-text-1 hover:border-gold/60 disabled:opacity-60"
          >
            <Pin aria-hidden className="size-3.5" />
            {post.pinned ? "Открепить" : "Закрепить"}
          </button>
        )}
        {post.canManage && (
          <button
            type="button"
            onClick={remove}
            disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-lg border border-glass-brd px-2.5 py-1.5 text-xs text-text-1 hover:border-magenta/60 disabled:opacity-60"
          >
            <Trash2 aria-hidden className="size-3.5" />
            Удалить
          </button>
        )}
      </footer>

      {post.canModerate && (
        <BlogLifetimeControl post={post} onChanged={onChanged} />
      )}

      {error && (
        <p role="alert" className="px-4 pb-3 text-xs text-magenta">
          {error}
        </p>
      )}
    </article>
  );
}

function Avatar({ name, url }: { name: string; url: string | null }) {
  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt=""
        className="size-9 shrink-0 rounded-full object-cover"
      />
    );
  }
  return (
    <span
      aria-hidden
      className="flex size-9 shrink-0 items-center justify-center rounded-full bg-bg-2 text-sm font-semibold text-text-1"
    >
      {name.slice(0, 1)}
    </span>
  );
}
