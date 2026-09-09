import type { ReactNode } from "react";
import { Header } from "@/components/header";
import { requireUser } from "@/lib/require-user";
import { InstallEnvironmentBeacon } from "@/components/pwa/install-environment-beacon";
import { MusicOfflineIdentity } from "@/components/music/player/offline-identity";
import { ChatCallProvider } from "@/components/chat/calls/call-provider";

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
  return (
    <div className="relative min-h-dvh bg-bg-0">
      <Header user={user} />
      <InstallEnvironmentBeacon />
      {/* Плеер живёт в корневом layout, а человек известен только здесь:
          отсюда он и узнаёт, чьё офлайн-хранилище открывать. */}
      <MusicOfflineIdentity userId={user.id} />
      {/* Звонки — поверх любого раздела: входящий должен догнать человека
          и в Мотивации, и на Рынке, а не только в открытой беседе. */}
      <ChatCallProvider userId={user.id}>{children}</ChatCallProvider>
    </div>
  );
}
