import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import type { BlogPublicPostDto } from "@vedamatch/shared";
import { getBlogPost, getPublicBlogPost } from "@/lib/blog-api";
import { loginHref, requireUser } from "@/lib/require-user";
import { BlogPostView } from "@/components/blog/blog-post-view";

/** Запасной заголовок: пост без слов — законный пост картиночной ленты. */
const FALLBACK_TITLE = "Пост блог-ленты";
const FALLBACK_OG_TITLE = "Блог-ленты VedaMatch";

/**
 * Картинка превью (VED-718): первая фотография поста или обложка первого
 * ролика — сам ролик картинкой не годится.
 *
 * Пустой список в `openGraph.images` обязателен даже когда картинки нет:
 * пустое поле перекрывает opengraph-image.png из корня, и мессенджер не
 * получает общую карточку портала вместо картинки поста.
 */
function previewImage(post: BlogPublicPostDto | null) {
  for (const item of post?.media ?? []) {
    const url = item.kind === "video" ? item.posterUrl : item.url;
    if (url) {
      return {
        url,
        width: item.width ?? undefined,
        height: item.height ?? undefined,
      };
    }
  }
  return null;
}

/**
 * Превью ссылки в мессенджерах (VED-718): читают его без cookie, поэтому
 * данные идут публичным методом API, а не запросом с Access-cookie — иначе
 * бот уходит на лендинг и видит карточку портала.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const post = await getPublicBlogPost(id);
  const title = post?.title?.trim() || FALLBACK_OG_TITLE;
  const description = post?.excerpt || undefined;
  const image = previewImage(post);
  return {
    // Посты с именами и фотографиями людей не должны попадать в поисковики.
    robots: { index: false, follow: false },
    title: post?.title?.trim() || FALLBACK_TITLE,
    description,
    openGraph: {
      type: "article",
      siteName: "VedaMatch",
      title,
      description,
      images: image ? [{ ...image, alt: title }] : [],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: image ? [image.url] : [],
    },
  };
}

/**
 * Страница одного поста (VED-238): сюда ведёт нажатие на картинку или
 * заголовок в виджете главной и ссылка из скопированного поста.
 */
export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // Вошедший читает пост как раньше. Cookie есть, а живого профиля нет (access
  // истёк) — на вход с возвратом сюда, как и до VED-718.
  if ((await cookies()).get("access_token")) {
    await requireUser();
    const post = await getBlogPost(id);
    if (!post) notFound();
    return (
      <main className="mx-auto max-w-2xl px-4 py-8 pb-28">
        <h1 className="sr-only">{post.title ?? `Пост: ${post.author.name}`}</h1>
        <BlogPostView initial={post} />
      </main>
    );
  }

  // Гость (VED-718): вместо редиректа на вход — тизер с кнопкой, которая
  // вернёт человека сюда после первого входа. Поста может и не быть (удалён
  // или не из общей ленты) — приглашение войти показываем и в этом случае:
  // ссылку могли переслать как раз человеку без аккаунта.
  const post = await getPublicBlogPost(id);
  const image = previewImage(post);
  return (
    <main className="mx-auto max-w-2xl px-4 py-8 pb-28">
      <article className="glass overflow-hidden rounded-3xl">
        {image && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={image.url}
            alt={post?.title ?? ""}
            className="aspect-[4/3] w-full bg-bg-1 object-cover"
          />
        )}
        <div className="p-6">
          <p className="text-sm font-semibold uppercase tracking-widest text-gold">
            Блог-лента
          </p>
          <h1 className="mt-2 text-2xl font-bold">
            {post?.title?.trim() || FALLBACK_TITLE}
          </h1>
          {post?.excerpt && (
            <p className="mt-4 leading-7 text-text-1">{post.excerpt}</p>
          )}
          <p className="mt-6 text-sm text-text-2">
            Полный пост открыт читателям с аккаунтом VedaMatch.
          </p>
          <Link
            href={loginHref(`/blog/posts/${encodeURIComponent(id)}`)}
            className="mt-4 block rounded-xl bg-gradient-to-r from-magenta to-[#B23EFF] px-5 py-3 text-center font-medium text-white"
          >
            Войти или зарегистрироваться в VedaMatch
          </Link>
        </div>
      </article>
    </main>
  );
}
