import { copyText } from "@/lib/copy-text";

/**
 * «Поделиться» постом Блог-ленты — одно на все кнопки сервиса: страницу
 * поста (VED-491), панель на главной (VED-497) и ряд кнопок под постом
 * (VED-442).
 *
 * Системное окно «Поделиться» — мессенджеры, почта и всё, что стоит на
 * телефоне. Где его нет (большинство браузеров на компьютере) — ссылка в
 * буфер обмена, и кнопка говорит «Ссылка скопирована».
 */

/** Ссылка на страницу поста — у репоста своя, а не оригинала. */
export function blogPostShareUrl(origin: string, postId: string): string {
  return `${origin}/blog/posts/${encodeURIComponent(postId)}`;
}

/**
 * Чем кончилось нажатие: `shared` — отдали системному окну, `copied` —
 * ссылка в буфере, `cancelled` — человек закрыл окно сам (это не ошибка),
 * `failed` — не вышло ни так, ни так.
 */
export type BlogShareResult = "shared" | "copied" | "cancelled" | "failed";

export interface BlogShareEnv {
  share?: (data: ShareData) => Promise<void>;
  copy: (text: string) => Promise<boolean>;
}

function browserEnv(): BlogShareEnv {
  return {
    share:
      typeof navigator !== "undefined" && typeof navigator.share === "function"
        ? (data) => navigator.share(data)
        : undefined,
    copy: copyText,
  };
}

export async function shareBlogPost(
  post: { id: string; title?: string | null },
  origin: string,
  env: BlogShareEnv = browserEnv(),
): Promise<BlogShareResult> {
  const url = blogPostShareUrl(origin, post.id);
  if (env.share) {
    try {
      await env.share({ title: post.title || "Блог-лента VedaMatch", url });
      return "shared";
    } catch (cause) {
      // Окно закрыли — молчим. Любой другой отказ (встроенный браузер
      // приложения, нет разрешения) — ссылка всё равно уйдёт в буфер.
      if (cause instanceof Error && cause.name === "AbortError")
        return "cancelled";
    }
  }
  return (await env.copy(url)) ? "copied" : "failed";
}
