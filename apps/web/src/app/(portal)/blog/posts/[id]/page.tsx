import { notFound } from "next/navigation";
import { getBlogPost } from "@/lib/blog-api";
import { requireUser } from "@/lib/require-user";
import { BlogPostView } from "@/components/blog/blog-post-view";

export const metadata = {
  title: "Пост блог-ленты",
  // Посты с именами и фотографиями людей не должны попадать в поисковики.
  robots: { index: false, follow: false },
};

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
