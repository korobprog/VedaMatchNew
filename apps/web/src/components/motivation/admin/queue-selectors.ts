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
 */
export function selectPublishedPosts(posts: MotivationAdminCandidateDto[]) {
  return posts.filter(
    (post) => post.status === "published" || post.status === "hidden",
  );
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
