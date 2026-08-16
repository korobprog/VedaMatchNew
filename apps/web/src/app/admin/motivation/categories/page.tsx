import { MotivationAdminTabs } from "@/components/motivation/admin/admin-tabs";
import { CategoryManager } from "@/components/motivation/admin/category-manager";
import { getAdminMotivationCategories } from "@/lib/motivation-api";

export default async function AdminMotivationCategoriesPage() {
  const categories = await getAdminMotivationCategories();

  return (
    <>
      <p className="mb-4 mt-2 max-w-3xl text-sm text-text-1">
        Категории видны при добавлении цитаты и в карточке очереди. Удаление
        категории не трогает уже опубликованные посты.
      </p>
      <MotivationAdminTabs active="categories" />
      <CategoryManager categories={categories} />
    </>
  );
}
