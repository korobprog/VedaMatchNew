"use client";

import { useEffect } from "react";
import { useMusicPlayer } from "./player-provider";

/**
 * Сообщает плееру, чьё офлайн-хранилище открывать.
 *
 * Отдельный компонент, а не проп провайдера: провайдер живёт в корневом
 * layout, общем с лендингом, а человек известен только в портальном. Тянуть
 * профиль наверх значило бы добавить запрос к каждой странице, включая те,
 * где плеера нет вовсе.
 *
 * Ничего не рисует.
 */
export function MusicOfflineIdentity({ userId }: { userId: string }) {
  const player = useMusicPlayer();
  const setOfflineUserId = player?.setOfflineUserId;

  useEffect(() => {
    if (!setOfflineUserId) return;
    setOfflineUserId(userId);
    return () => setOfflineUserId(null);
  }, [setOfflineUserId, userId]);

  return null;
}
