import { MotivationAdminTabs } from "@/components/motivation/admin/admin-tabs";
import { VideoManager } from "@/components/motivation/admin/video-manager";
import {
  getAdminMotivationCategories,
  getMotivationVideos,
} from "@/lib/motivation-api";

/**
 * Короткие видео для ленты «Видео» (VED-246) — загрузка, как у готовых
 * картинок: файл и категория, публикуется сразу.
 */
export default async function AdminMotivationVideosPage() {
  const [categories, videos] = await Promise.all([
    getAdminMotivationCategories(),
    // Последние 30 — потолок страницы на сервере; старше — в самой ленте.
    getMotivationVideos(undefined, 30),
  ]);

  return (
    <>
      <p className="mb-4 mt-2 max-w-3xl text-sm text-text-1">
        Короткие ролики — отдельная лента «Видео» рядом с «Открытками», с теми
        же категориями, что у афоризмов. Без генерации и без проверки: ролик
        публикуется в выбранную категорию сразу.
      </p>
      <MotivationAdminTabs active="videos" />
      <VideoManager
        categories={categories ?? []}
        initial={videos?.items ?? []}
      />
    </>
  );
}
