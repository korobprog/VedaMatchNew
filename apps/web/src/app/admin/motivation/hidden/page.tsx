import { MotivationAdminTabs } from "@/components/motivation/admin/admin-tabs";
import { MotivationPublishedList } from "@/components/motivation/admin/published-list";
import {
  countQueue,
  selectHiddenPosts,
} from "@/components/motivation/admin/queue-selectors";
import {
  getAdminMotivationPosts,
  getMotivationCategories,
} from "@/lib/motivation-api";
import { parsePostKind } from "@/components/motivation/admin/post-kind";

/**
 * «Скрытые» — весь список снятого с показа отдельно от «Опубликованных»
 * (VED-251, чек-лист: «Сделай кнопку — скрытые в главном меню редакции
 * вдохновения… чтобы в ней был виден весь список скрытых и чтобы там можно
 * было их снова открывать в ленту, возвращать»).
 *
 * Своей вёрстки нет — тот же `MotivationPublishedList`, что и на
 * «Опубликованных», с тем же `PostActions` и кнопкой возврата, только
 * список сужен до `status === 'hidden'` (`variant="hidden"` меняет только
 * подписи для пустого списка и счётчика).
 */
export default async function AdminMotivationHiddenPage({
  searchParams,
}: {
  /** `?kind=art|cards` — какая из двух редакций (VED-299). */
  searchParams: Promise<{ kind?: string }>;
}) {
  const [posts, categories, { kind }] = await Promise.all([
    getAdminMotivationPosts(),
    // Тот же справочник, что и на «Опубликованных»: категорию скрытой
    // карточки можно поправить, не дожидаясь возврата в ленту.
    getMotivationCategories(),
    searchParams,
  ]);
  const hiddenCount = posts ? selectHiddenPosts(posts).length : undefined;

  return (
    <>
      <p className="mb-4 mt-2 max-w-3xl text-sm text-text-1">
        Всё, что вы сняли с показа вручную или скрылось само по жалобам, —
        здесь целиком. «Вернуть в ленту» возвращает карточку туда же, откуда
        её сняли, — на «Опубликованные», без повторной проверки.
      </p>
      <MotivationAdminTabs
        active="hidden"
        queueCount={posts ? countQueue(posts) : undefined}
        hiddenCount={hiddenCount}
      />
      <MotivationPublishedList
        posts={posts ? selectHiddenPosts(posts) : null}
        categories={categories ?? []}
        variant="hidden"
        kind={parsePostKind(kind)}
      />
    </>
  );
}
