import type { ReactNode } from "react";
import { ChatCallProvider } from "@/components/chat/calls/call-provider";
import { GroupCallProvider } from "@/components/chat/calls/group/group-call-provider";

/**
 * Звонки портала — одна точка подключения на всё дерево вошедшего
 * (VED-231). Стоит в корневом layout, а не в группе `(portal)`: профиль,
 * Библиотека, Мотивация, уведомления и прочие страницы лежат вне группы, и
 * входящий звонок там не показывался и не звонил — уходил в пропущенные.
 * Подключать второй раз ниже по дереву нельзя: два провайдера — две
 * подписки на поток и два рингтона на один звонок.
 *
 * Групповой звонок — отдельным провайдером рядом, а не веткой внутри: у
 * комнаты своё состояние и до шести соединений, и мешать его с «один
 * звонок, две роли» значит ломать работающее. Плашка «идёт звонок» тоже
 * должна находить человека в любом разделе.
 *
 * Без `userId` (гость или профиль не получен) звонков нет вовсе.
 */
export function PortalCallProviders({
  userId,
  children,
}: {
  userId: string | null | undefined;
  children: ReactNode;
}) {
  if (!userId) return <>{children}</>;
  return (
    <ChatCallProvider userId={userId}>
      <GroupCallProvider userId={userId}>{children}</GroupCallProvider>
    </ChatCallProvider>
  );
}
