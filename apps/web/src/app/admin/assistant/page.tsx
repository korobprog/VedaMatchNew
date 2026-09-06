import { redirect } from "next/navigation";
import { canOpenAdminSection } from "@/lib/admin-nav";
import { redirectToLogin } from "@/lib/require-user";
import { getProfile } from "@/lib/api";
import {
  getAdminAssistantSettings,
  getAdminAssistantUsage,
} from "@/lib/assistant-api";
import { AdminAssistantForm } from "@/components/assistant/admin-assistant-form";

export const metadata = {
  title: "Ассистент — настройки и расход",
  robots: { index: false, follow: false },
};

export default async function AdminAssistantPage() {
  const user = await getProfile();
  if (!user) redirectToLogin("/admin/assistant");
  if (!canOpenAdminSection(user, "assistant")) redirect("/");

  const [settings, usage] = await Promise.all([
    getAdminAssistantSettings(),
    getAdminAssistantUsage(30),
  ]);
  if (!settings || !usage)
    throw new Error("Не удалось загрузить настройки ассистента");

  return (
    <>
      <h1 className="mb-2 font-display text-2xl font-bold text-text-0">
        Ассистент: настройки и расход
      </h1>
      <p className="mb-6 text-text-1">
        Каждый ответ — платный запрос к модели. Здесь выключатели, лимиты на
        человека и на портал, дополнение к инструкции и картина того, какими
        сервисами люди пользуются через ассистента. Применяется сразу.
      </p>
      <AdminAssistantForm initialSettings={settings} usage={usage} />
    </>
  );
}
