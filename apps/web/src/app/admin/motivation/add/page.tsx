import { MotivationAdminTabs } from "@/components/motivation/admin/admin-tabs";
import { ManualQuoteForm } from "@/components/motivation/manual-quote-form";
import { getAdminMotivationCategories } from "@/lib/motivation-api";

export default async function AdminMotivationAddPage() {
  const categories = await getAdminMotivationCategories();

  return (
    <>
      <p className="mb-4 mt-2 max-w-3xl text-sm text-text-1">
        Ручная цитата проходит тот же путь, что и найденная ИИ: попадает в очередь и
        требует обычного одобрения.
      </p>
      <MotivationAdminTabs active="add" />
      <ManualQuoteForm categories={categories ?? []} />
    </>
  );
}
