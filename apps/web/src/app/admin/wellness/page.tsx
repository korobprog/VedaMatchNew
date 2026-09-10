import { AdminWellnessView } from "@/components/wellness/admin/admin-wellness-view";

export default function AdminWellnessPage() {
  return (
    <>
      <p className="mt-2 text-sm text-text-1">
        Справочник ингредиентов, очередь присланных продуктов и жалобы на
        состав. Пока в справочнике нет алиаса, сканер этот ингредиент не найдёт.
      </p>
      <AdminWellnessView />
    </>
  );
}
