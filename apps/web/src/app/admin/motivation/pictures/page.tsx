import { MotivationAdminTabs } from "@/components/motivation/admin/admin-tabs";
import { PictureUploadForm } from "@/components/motivation/admin/picture-upload-form";
import { getAdminMotivationCategories } from "@/lib/motivation-api";

/**
 * Готовые картинки с афоризмами — сразу в категорию (VED-87). `?category=`
 * приходит со страницы папки: из «Шастр» на загрузку попадают уже с
 * выбранными «Шастрами».
 */
export default async function AdminMotivationPicturesPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string | string[] }>;
}) {
  const [{ category }, categories] = await Promise.all([
    searchParams,
    getAdminMotivationCategories(),
  ]);

  return (
    <>
      <p className="mb-4 mt-2 max-w-3xl text-sm text-text-1">
        Открытки, где цитата уже напечатана на картинке. Без генерации и без
        проверки: картинка публикуется в выбранную категорию сразу и в ленте
        показывается целиком, без текста поверх.
      </p>
      <MotivationAdminTabs active="pictures" />
      <PictureUploadForm
        categories={categories ?? []}
        initialCategory={Array.isArray(category) ? category[0] : category}
      />
    </>
  );
}
