import { redirect } from "next/navigation";
import { redirectToLogin } from "@/lib/require-user";
import { getAdminBillingMode, getProfile } from "@/lib/api";
import { AdminBillingModeForm } from "@/components/admin-billing-mode-form";

export default async function AdminSettingsPage() {
  const user = await getProfile();
  if (!user) redirectToLogin("/admin/settings");
  if (user.role !== "admin") redirect("/");

  const billingMode = await getAdminBillingMode();
  if (!billingMode) throw new Error("Не удалось загрузить настройки биллинга");

  return (
    <>
      <h1 className="mb-2 font-display text-2xl font-bold text-text-0">Настройки платформы</h1>
      <p className="mb-6 text-text-1">Глобальные параметры, которые видят все пользователи.</p>
      <AdminBillingModeForm initialMode={billingMode.mode} />
    </>
  );
}
