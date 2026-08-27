import type { Metadata } from "next";
import { MusicRail } from "@/components/music/music-rail";
import { MusicSettingsForm } from "@/components/music/music-settings-form";
import { getMusicSettingsServer } from "@/lib/music-api";

export const metadata: Metadata = {
  title: "Настройки Музыки",
  robots: { index: false, follow: false },
};

/**
 * Настройки прослушивания. См. docs/music-service-plan.md, «Приватность».
 *
 * Значения приезжают с сервера уже с умолчаниями: строки настроек у человека
 * может не быть, и это норма, а не сбой. Разбираться в этом странице не
 * приходится.
 */
export default async function MusicSettingsPage() {
  const settings = await getMusicSettingsServer();

  return (
    <main className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8 md:px-6 md:py-10 lg:flex-row">
      <MusicRail active="settings" />

      <div className="min-w-0 max-w-2xl flex-1">
        <header className="mb-6 flex flex-col gap-1.5">
          <h1 className="font-display text-2xl font-bold tracking-tight text-text-0">
            Настройки Музыки
          </h1>
          <p className="text-sm text-text-2">
            Видимость прослушивания и поведение плеера
          </p>
        </header>

        {settings ? (
          <MusicSettingsForm initial={settings} />
        ) : (
          <p className="glass rounded-2xl border border-glass-brd p-6 text-sm text-text-1">
            Настройки сейчас недоступны. Попробуйте обновить страницу.
          </p>
        )}
      </div>
    </main>
  );
}
