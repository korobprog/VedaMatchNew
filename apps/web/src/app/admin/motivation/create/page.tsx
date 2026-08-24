import { MotivationAdminTabs } from "@/components/motivation/admin/admin-tabs";
import { ManualPostForm } from "@/components/motivation/admin/manual-post-form";
import { getAdminMotivationCategories } from "@/lib/motivation-api";

export default async function AdminMotivationCreatePage() {
  const categories = await getAdminMotivationCategories();

  return (
    <>
      <p className="mb-4 mt-2 max-w-3xl text-sm text-text-1">
        Вдохновение целиком вашими словами: нейросеть не пишет ни заголовок, ни
        пояснение. За ней остаётся только изображение, и его вы одобряете как обычно.
      </p>
      <MotivationAdminTabs active="create" />
      <ManualPostForm categories={categories ?? []} />
    </>
  );
}
