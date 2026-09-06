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
 * Опубликованное — то, что люди уже читают в ленте.
 *
 * Отдельным разделом, а не строкой в общем «архиве»: опубликованное и
 * отклонённое ищут по разным поводам. За первым приходят, чтобы поправить
 * опечатку или снять с показа, за вторым — чтобы убедиться, что оно не
 * висит. Сваленные в один свёрнутый список, они прятали и то, и другое.
 *
 * Признак — `status`, а не `reviewStatus`: скрытая администратором карточка
 * остаётся `reviewStatus: 'published'`, но из ленты уже ушла, и держать её
 * среди опубликованного значило бы врать разделом.
 */
export function selectPublishedPosts(posts: MotivationAdminCandidateDto[]) {
  return posts.filter((post) => post.status === "published");
}

/** Отложенное: отклонённое и скрытое. Ни очередь, ни лента его не ждут. */
export function selectSetAsidePosts(posts: MotivationAdminCandidateDto[]) {
  const inQueue = new Set(
    [...selectTextPosts(posts), ...selectImagePosts(posts)].map((post) => post.id),
  );
  return posts.filter(
    (post) => !inQueue.has(post.id) && post.status !== "published",
  );
}

/** Сколько карточек реально ждут админа — цифра на вкладке «Заготовки». */
export function countQueue(posts: MotivationAdminCandidateDto[]) {
  return selectTextPosts(posts).length + selectImagePosts(posts).length;
}
