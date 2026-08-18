import { MotivationAdminTabs } from "@/components/motivation/admin/admin-tabs";
import { LoadFailure } from "@/components/motivation/admin/load-failure";
import { MotivationSettingsForm } from "@/components/motivation/admin/settings-form";
import { getMotivationSettings } from "@/lib/motivation-api";

export default async function AdminMotivationSettingsPage() {
  const settings = await getMotivationSettings();

  return (
    <>
      <p className="mb-4 mt-2 max-w-3xl text-sm text-text-1">
        Настройки применяются ко всему сервису. У поста их можно переопределить —
        пустое поле в карточке означает «взять отсюда». Ключи провайдеров здесь
        не хранятся: они остаются в окружении.
      </p>
      <MotivationAdminTabs active="settings" />
      {settings ? (
        <MotivationSettingsForm settings={settings} />
      ) : (
        <LoadFailure what="настройки сервиса" />
      )}
    </>
  );
}
