import type { MotivationAdminCandidateDto } from "@vedamatch/shared";

/**
 * Разбор списка на очереди. Отдельный модуль без "use client": счётчик на
 * вкладке считается на сервере, а экспорт из клиентского модуля Next превращает
 * в client reference, который на сервере не вызвать.
 */

/** Ожидают проверки текста — включая упавшие до одобрения текста. */
export function selectTextPosts(posts: MotivationAdminCandidateDto[]) {
  return posts.filter(
    (post) =>
      ["discovered", "source_verified", "text_review"].includes(post.reviewStatus) ||
      (post.reviewStatus === "failed" && !post.textApprovedAt),
  );
}

/** Ожидают изображения — включая упавшие уже после одобрения текста. */
export function selectImagePosts(posts: MotivationAdminCandidateDto[]) {
  return posts.filter(
    (post) =>
      ["image_queued", "image_review"].includes(post.reviewStatus) ||
      (post.reviewStatus === "failed" && Boolean(post.textApprovedAt)),
  );
}

/**
 * Опубликованное — то, что люди уже читают в ленте, плюс то, что читали до
 * недавнего «Скрыть».
 *
 * Отдельным разделом, а не строкой в общем «архиве»: опубликованное и
 * отклонённое ищут по разным поводам. За первым приходят, чтобы поправить
 * опечатку или снять с показа, за вторым — чтобы убедиться, что оно не
 * висит. Сваленные в один свёрнутый список, они прятали и то, и другое.
 *
 * `status: 'hidden'` достижим только из `'published'` (см. `adminUpdate`,
 * авто-скрытие по жалобам и скрытие рилса) — другого пути у этого статуса
 * нет. Раньше такая карточка в ту же секунду пропадала из этого списка и
 * молча уезжала в «Заготовки» → «Отложенные» вперемешку с по-настоящему
 * отклонённым генерацией (VED-251): «Скрыть» ощущалось как «удалить».
 * Теперь она остаётся здесь же, с бейджем «Скрыто из ленты» и той же
 * кнопкой-переключателем — «Скрыть» отменяется на месте, без похода в
 * другую вкладку. `selectSetAsidePosts` эти карточки больше не забирает —
 * дом у скрытого после публикации один, дублировать его в «Отложенных» незачем.
 *
 * Скрытое всегда идёт в самом низу списка (VED-251, чек-лист: «Все скрытые
 * афоризмы отправляй в самый низ ленты в меню редакции»), а не вперемешку с
 * видимым — иначе снятые с показа карточки то и дело попадались первыми и
 * заслоняли то, что сейчас действительно читают. Сортировка стабильна:
 * `Array.prototype.sort` по спецификации не переставляет местами элементы с
 * одинаковым ключом, так что порядок внутри каждой из двух групп остаётся
 * тем же, каким его отдал сервер.
 */
export function selectPublishedPosts(posts: MotivationAdminCandidateDto[]) {
  return posts
    .filter((post) => post.status === "published" || post.status === "hidden")
    .sort((a, b) => Number(a.status === "hidden") - Number(b.status === "hidden"));
}

/**
 * Отдельная вкладка «Скрытые» (VED-251): весь список того, что снято с
 * показа, — чтобы не выискивать скрытые карточки среди опубликованных.
 * Возврат в ленту — та же кнопка, что и на «Опубликованных» (общий
 * `PostActions` в `published-list.tsx`).
 */
export function selectHiddenPosts(posts: MotivationAdminCandidateDto[]) {
  return posts.filter((post) => post.status === "hidden");
}

/**
 * Отложенное: по-настоящему отклонённое генерацией (`status: 'draft'`,
 * `reviewStatus: 'rejected'`). Скрытое после публикации сюда больше не
 * попадает — у него теперь единственный дом на вкладке «Опубликованные»
 * (см. `selectPublishedPosts`).
 */
export function selectSetAsidePosts(posts: MotivationAdminCandidateDto[]) {
  const inQueue = new Set(
    [...selectTextPosts(posts), ...selectImagePosts(posts)].map((post) => post.id),
  );
  return posts.filter(
    (post) =>
      !inQueue.has(post.id) &&
      post.status !== "published" &&
      post.status !== "hidden",
  );
}

/** Сколько карточек реально ждут админа — цифра на вкладке «Заготовки». */
export function countQueue(posts: MotivationAdminCandidateDto[]) {
  return selectTextPosts(posts).length + selectImagePosts(posts).length;
}

/**
 * Поиск по очереди (VED-200) — тот же приём, что уже работает на
 * «Опубликованных» (`published-list.tsx`): без учёта регистра, по цитате,
 * заголовку, автору и названию рубрики. Один и тот же фильтр накладывается
 * поверх обеих выборок очереди («Цитаты и текст» и «Изображения») — критерий
 * поиска не зависит от того, на какой стадии сейчас карточка.
 */
export function filterByQuery(
  posts: MotivationAdminCandidateDto[],
  query: string,
): MotivationAdminCandidateDto[] {
  const needle = query.trim().toLocaleLowerCase("ru-RU");
  if (!needle) return posts;
  return posts.filter((post) =>
    [post.title, post.text, post.attributionSpeaker, post.categoryTitle]
      .filter(Boolean)
      .some((field) => field!.toLocaleLowerCase("ru-RU").includes(needle)),
  );
}
