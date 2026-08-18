import { MotivationAdminTabs } from "@/components/motivation/admin/admin-tabs";
import { LoadFailure } from "@/components/motivation/admin/load-failure";
import { MusicLibrary } from "@/components/motivation/admin/music-library";
import { MotivationSettingsForm } from "@/components/motivation/admin/settings-form";
import {
  getMotivationSettings,
  getMotivationTracks,
} from "@/lib/motivation-api";

export default async function AdminMotivationSettingsPage() {
  const [settings, tracks] = await Promise.all([
    getMotivationSettings(),
    getMotivationTracks(),
  ]);

  return (
    <>
      <p className="mb-4 mt-2 max-w-3xl text-sm text-text-1">
        Настройки применяются ко всему сервису. У поста их можно переопределить —
        пустое поле в карточке означает «взять отсюда». Ключи провайдеров здесь
        не хранятся: они остаются в окружении.
      </p>
      <MotivationAdminTabs active="settings" />
      {settings ? (
        <div className="grid gap-4">
          <MotivationSettingsForm settings={settings} />
          <MusicLibrary
            tracks={tracks ?? []}
            defaultTrackId={settings.defaultTrackId}
          />
        </div>
      ) : (
        <LoadFailure what="настройки сервиса" />
      )}
    </>
  );
}
