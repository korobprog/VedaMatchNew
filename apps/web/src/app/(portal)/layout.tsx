import type { ReactNode } from "react";
import { canAdminService } from "@vedamatch/shared";
import { headers } from "next/headers";
import { Header } from "@/components/header";
import { getProfile } from "@/lib/api";
import { requireUser } from "@/lib/require-user";
import { InstallEnvironmentBeacon } from "@/components/pwa/install-environment-beacon";
import { MusicOfflineIdentity } from "@/components/music/player/offline-identity";
import { MusicEditorIdentity } from "@/components/music/player/editor-identity";

/** Зеркало PATHNAME_HEADER в lib/require-user.ts: proxy кладёт путь запроса. */
const PATHNAME_HEADER = "x-pathname";

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
  // Пост блог-ленты открыт гостю (VED-718): «Поделиться» ведёт на саму ссылку
  // поста, и читатель приходит без аккаунта — боту мессенджера нужны мета-теги
  // превью, человеку — тизер с кнопкой входа. Гостю здесь только фон: шапка,
  // плеер и окна остаются для вошедшего, страница рисует своё.
  const pathname = (await headers()).get(PATHNAME_HEADER);
  const user = pathname?.startsWith("/blog/posts/")
    ? await getProfile()
    : await requireUser();
  if (!user) {
    return <div className="relative min-h-dvh bg-bg-0">{children}</div>;
  }
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
