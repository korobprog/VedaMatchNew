import { MotivationAdminTabs } from "@/components/motivation/admin/admin-tabs";
import { MotivationPublishedList } from "@/components/motivation/admin/published-list";
import {
  countQueue,
  selectPublishedPosts,
} from "@/components/motivation/admin/queue-selectors";
import { getAdminMotivationPosts } from "@/lib/motivation-api";

/**
 * Опубликованное — отдельным разделом.
 *
 * За опубликованным и за отклонённым приходят по разным поводам: первое
 * правят и снимают с показа, второе проверяют, что оно не висит. Свёрнутый
 * список «Уже прошли очередь» в самом низу очереди прятал и то, и другое.
 */
export default async function AdminMotivationPublishedPage({
  searchParams,
}: {
  /** `?post=<slug>` — переход из ленты: открываем правку сразу этой карточки. */
  searchParams: Promise<{ post?: string }>;
}) {
  const [posts, { post }] = await Promise.all([
    getAdminMotivationPosts(),
    searchParams,
  ]);

  return (
    <>
      <p className="mb-4 mt-2 max-w-3xl text-sm text-text-1">
        Всё, что уже видно в ленте. Здесь можно поправить текст, снять с показа
        или удалить. Заготовки и всё, что ждёт проверки, — во вкладке
        «Заготовки».
      </p>
      <MotivationAdminTabs
        active="published"
        queueCount={posts ? countQueue(posts) : undefined}
      />
      <MotivationPublishedList
        posts={posts ? selectPublishedPosts(posts) : null}
        openSlug={post}
      />
    </>
  );
}
