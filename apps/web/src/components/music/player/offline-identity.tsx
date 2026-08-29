"use client";

import { useEffect } from "react";
import { fetchAllowedOfflineIds } from "@/lib/music/offline-api";
import { dropRevokedTracks } from "@/lib/music/offline-manager";
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

  // Сверка при старте: запись могли снять по жалобе, пока человека не было,
  // и обещание её убрать действует и на сохранённых копиях. Молча — это
  // уборка, а не его действие, сообщать не о чем.
  useEffect(() => {
    void dropRevokedTracks(userId, fetchAllowedOfflineIds).catch(() => {
      // Нет сети или запрет хранилища — ничего не трогаем.
    });
  }, [userId]);

  return null;
}
