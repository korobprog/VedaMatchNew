"use client";

import { useId, useState } from "react";
import {
  BLOG_FEED_REVIEW_NOTE_MAX_LENGTH,
  type BlogPostDto,
} from "@vedamatch/shared";
import { BlogApiError, reviewBlogFeedRequest } from "@/lib/blog-client-api";
import { BlogPostCard } from "./blog-post-card";

/**
 * Очередь «предложено в ленту» (VED-686), старые сверху. Пост показан той же
 * карточкой, что в ленте: администратор решает по тому, что увидят читатели.
 * Решённый пост из очереди уходит сразу — повторно его рассматривать нечем.
 */
export function BlogFeedReview({ initial }: { initial: BlogPostDto[] }) {
  const [posts, setPosts] = useState(initial);

  if (posts.length === 0) {
    return (
      <p className="rounded-2xl border border-glass-brd bg-glass px-4 py-8 text-center text-sm text-text-1">
        Предложенных постов нет
      </p>
    );
  }

  return (
    <ul className="space-y-4">
      {posts.map((post) => (
        <li key={post.id}>
          <ReviewItem
            post={post}
            onDone={() =>
              setPosts((current) => current.filter((it) => it.id !== post.id))
            }
          />
        </li>
      ))}
    </ul>
  );
}

function ReviewItem({
  post,
  onDone,
}: {
  post: BlogPostDto;
  onDone: () => void;
}) {
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const noteId = useId();
  const over = note.length > BLOG_FEED_REVIEW_NOTE_MAX_LENGTH;

  async function decide(decision: "approve" | "reject") {
    setPending(true);
    setError(null);
    try {
      await reviewBlogFeedRequest(post.id, {
        decision,
        ...(decision === "reject" && note.trim() ? { note: note.trim() } : {}),
      });
      onDone();
    } catch (cause) {
      // «Уже рассмотрен» (409) тоже убирает пост: его решил другой админ.
      if (cause instanceof BlogApiError && cause.code === "not_pending") {
        onDone();
        return;
      }
      setError(cause instanceof BlogApiError ? cause.message : "Не вышло.");
      setPending(false);
    }
  }

  return (
    <div>
      {/* Удаление поста админом тоже убирает его из очереди. */}
      <BlogPostCard post={post} expanded onRemoved={onDone} />
      <div className="mt-2 rounded-2xl border border-glass-brd bg-glass p-3">
        {rejecting ? (
          <div>
            <label
              htmlFor={noteId}
              className="block text-xs font-semibold text-text-0"
            >
              Пояснение автору (необязательно)
            </label>
            <textarea
              id={noteId}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              rows={3}
              className="mt-1 w-full rounded-lg border border-glass-brd bg-bg-1 px-3 py-2 text-sm text-text-0"
            />
            <p
              className={`mt-1 text-xs ${over ? "text-magenta" : "text-text-1"}`}
            >
              {note.length} / {BLOG_FEED_REVIEW_NOTE_MAX_LENGTH}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void decide("reject")}
                disabled={pending || over}
                className="min-h-11 rounded-lg bg-mint px-4 py-2 text-sm font-semibold text-on-mint disabled:opacity-60"
              >
                Отправить отказ
              </button>
              <button
                type="button"
                onClick={() => setRejecting(false)}
                disabled={pending}
                className="min-h-11 rounded-lg border border-glass-brd px-4 py-2 text-sm text-text-1 disabled:opacity-60"
              >
                Отмена
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void decide("approve")}
              disabled={pending}
              className="min-h-11 rounded-lg bg-mint px-4 py-2 text-sm font-semibold text-on-mint disabled:opacity-60"
            >
              Одобрить
            </button>
            <button
              type="button"
              onClick={() => setRejecting(true)}
              disabled={pending}
              className="min-h-11 rounded-lg border border-glass-brd px-4 py-2 text-sm text-text-0 hover:border-magenta/60 disabled:opacity-60"
            >
              Отклонить
            </button>
          </div>
        )}
        {error && (
          <p role="alert" className="mt-2 text-xs text-magenta">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
