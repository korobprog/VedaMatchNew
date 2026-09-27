import type { ReactNode } from "react";
import { canAdminService } from "@vedamatch/shared";
import { Header } from "@/components/header";
import { requireUser } from "@/lib/require-user";
import { InstallEnvironmentBeacon } from "@/components/pwa/install-environment-beacon";
import { MusicOfflineIdentity } from "@/components/music/player/offline-identity";
import { MusicEditorIdentity } from "@/components/music/player/editor-identity";

/**
 * Приватные разделы портала: один guard и одна шапка на всех вместо
 * повторяющегося `getProfile → redirect → <Header/>` в каждой странице.
 * Страница отдаёт только `<main>`; фон и min-h-dvh — здесь.
 */
export default async function PortalLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = await requireUser();
  // Тот же способ проверки прав, что и на странице записи (VED-102,
  // VED-109): редакция Музыки — роль плюс список сервисов админки.
  const canEditMusic = canAdminService(
    { role: user.role, adminServices: user.adminServices },
    "music",
  );
  return (
    <div className="relative min-h-dvh bg-bg-0">
      <Header user={user} />
      <InstallEnvironmentBeacon />
      {/* Плеер живёт в корневом layout, а человек известен только здесь:
          отсюда он и узнаёт, чьё офлайн-хранилище открывать. */}
      <MusicOfflineIdentity userId={user.id} />
      {/* Кнопка «редактировать текст» в панели текста плеера (VED-269)
          видна только редакции Музыки — права тоже известны только
          здесь. */}
      <MusicEditorIdentity canEdit={canEditMusic} />
      {/* Звонки (ChatCallProvider и групповой) — в корневом layout
          (VED-231): входящий должен догнать человека и на страницах вне
          этой группы. Второй провайдер здесь дал бы двойной рингтон. */}
      {children}
    </div>
  );
}
