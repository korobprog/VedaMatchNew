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

/** Всё остальное: опубликованное, отклонённое, скрытое. */
export function selectArchivedPosts(posts: MotivationAdminCandidateDto[]) {
  const inQueue = new Set(
    [...selectTextPosts(posts), ...selectImagePosts(posts)].map((post) => post.id),
  );
  return posts.filter((post) => !inQueue.has(post.id));
}

/** Сколько карточек реально ждут админа — цифра на вкладке «Очередь». */
export function countQueue(posts: MotivationAdminCandidateDto[]) {
  return selectTextPosts(posts).length + selectImagePosts(posts).length;
}
