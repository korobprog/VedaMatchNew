import type { ReactNode } from "react";
import { canAdminService } from "@vedamatch/shared";
import { Header } from "@/components/header";
import { requireUser } from "@/lib/require-user";
import { InstallEnvironmentBeacon } from "@/components/pwa/install-environment-beacon";
import { MusicOfflineIdentity } from "@/components/music/player/offline-identity";
import { MusicEditorIdentity } from "@/components/music/player/editor-identity";
import { ChatCallProvider } from "@/components/chat/calls/call-provider";
import { GroupCallProvider } from "@/components/chat/calls/group/group-call-provider";

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
      {/* Звонки — поверх любого раздела: входящий должен догнать человека
          и в Мотивации, и на Рынке, а не только в открытой беседе. */}
      {/* Групповой звонок — отдельным провайдером рядом, а не веткой
          внутри: у комнаты своё состояние и до шести соединений, и
          мешать его с «один звонок, две роли» значит ломать работающее.
          Плашка «идёт звонок» тоже должна находить человека в любом
          разделе, поэтому он здесь, а не в беседе. */}
      <ChatCallProvider userId={user.id}>
        <GroupCallProvider userId={user.id}>{children}</GroupCallProvider>
      </ChatCallProvider>
    </div>
  );
}
