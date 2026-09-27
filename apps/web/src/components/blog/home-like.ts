import type { BlogPostDto } from "@vedamatch/shared";

/** Отметка «Нравится» у поста и сколько их всего (VED-505). */
export interface HomeLikeState {
  liked: boolean;
  likeCount: number;
}

/**
 * Отметка поста на экране виджета главной (VED-586): своя, если её уже
 * ставили или снимали в виджете, иначе — пришедшая с постом.
 */
export function homeLikeOf(
  post: Pick<BlogPostDto, "id" | "liked" | "likeCount">,
  overrides: Readonly<Record<string, HomeLikeState>>,
): HomeLikeState {
  return (
    overrides[post.id] ?? {
      liked: post.liked ?? false,
      likeCount: post.likeCount ?? 0,
    }
  );
}

/** Нажатие «Нравится»: отметка меняется сразу, число — на единицу. */
export function toggleHomeLike(state: HomeLikeState): HomeLikeState {
  const liked = !state.liked;
  return {
    liked,
    likeCount: Math.max(0, state.likeCount + (liked ? 1 : -1)),
  };
}
