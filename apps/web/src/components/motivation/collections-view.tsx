import Link from "next/link";
import type { MotivationCategoryDto, MotivationPostDto } from "@vedamatch/shared";

/**
 * Папки готовых карточек: разделы и подразделы, за каждым — сетка картинок.
 *
 * Лента отвечает на «покажи что-нибудь», а это — на «покажи про Веды»: за
 * вторым в ленту не ходят, там нет ни оглавления, ни возврата к тому, что
 * листал вчера. Поэтому отдельный экран, а не фильтр внутри ленты.
 *
 * Сетка картинок, а не список: карточка вдохновения — это картинка с
 * подписью, и узнают её именно по картинке. Подпись остаётся ради
 * скринридера и тех, у кого картинка не загрузилась.
 */
export function MotivationCollections({
  categories,
}: {
  categories: MotivationCategoryDto[];
}) {
  const roots = categories.filter((category) => !category.parentId);

  if (roots.length === 0)
    return (
      <p className="glass rounded-2xl border border-glass-brd p-4 text-sm text-text-2">
        Разделов пока нет. Всё опубликованное — в ленте.
      </p>
    );

  return (
    <div className="space-y-6">
      {roots.map((root) => {
        const children = categories.filter(
          (category) => category.parentId === root.id,
        );
        return (
          <section key={root.id}>
            <h2 className="mb-2 font-display text-lg font-bold text-text-0">
              <Link href={`/motivation/collections/${root.slug}`} className="hover:text-cyan">
                {root.title}
              </Link>{" "}
              <span className="font-mono text-xs font-medium text-text-2">
                {root.postCount}
              </span>
            </h2>
            {children.length > 0 && (
              <ul className="flex flex-wrap gap-2">
                {children.map((child) => (
                  <li key={child.id}>
                    <Link
                      href={`/motivation/collections/${child.slug}`}
                      className="glass inline-flex items-center gap-1.5 rounded-full border border-glass-brd px-3 py-1.5 text-sm text-text-1 hover:text-text-0"
                    >
                      {child.title}
                      <span className="font-mono text-xs text-text-2">
                        {child.postCount}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}

/**
 * Карточки одной папки.
 *
 * Ссылка ведёт в ленту, открытую на этой карточке, а не на отдельную
 * страницу поста: смотреть вдохновение умеет лента — там и звук, и
 * пояснение, и «сохранить», — а второй экран показа расходился бы с ней
 * возможностями.
 */
export function MotivationCollectionGrid({
  posts,
}: {
  posts: MotivationPostDto[];
}) {
  if (posts.length === 0)
    return (
      <p className="glass rounded-2xl border border-glass-brd p-4 text-sm text-text-2">
        В этом разделе пока пусто.
      </p>
    );

  return (
    <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
      {posts.map((post) => (
        <li key={post.id}>
          <Link
            href={`/motivation?post=${encodeURIComponent(post.slug)}`}
            className="group block overflow-hidden rounded-xl border border-glass-brd"
          >
            {/* Ссылка на хранилище подписана и может истечь — next/image не
                годится для произвольно меняющегося домена подписи. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={post.imageUrl}
              alt=""
              loading="lazy"
              className="aspect-[3/4] w-full object-cover transition-transform group-hover:scale-[1.02] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
            />
            {/* У афоризма участника заголовок — название книги; подписываем
                началом самой цитаты, как и остальные плитки — смыслом. */}
            <span className="block truncate px-2 py-1.5 text-xs text-text-1">
              {post.origin === "user"
                ? post.storyText || post.text.split("\n")[0]
                : post.title || post.storyText}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
