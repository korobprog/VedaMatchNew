"use client";

import { useEffect } from "react";
import { useMusicPlayer } from "./player-provider";

/**
 * Сообщает плееру, что человек — в редакции Музыки (VED-269).
 *
 * Отдельный компонент, а не проп провайдера, тем же приёмом, что
 * `MusicOfflineIdentity`: провайдер живёт в корневом layout, общем с
 * лендингом, а права известны только в портальном. Кнопка «редактировать
 * текст» в панели текста плеера смонтирована глобально (полоса плеера —
 * в корневом layout) и сама не знает, на какой странице сейчас человек и
 * есть ли у него права редакции — их и приносит этот маячок.
 *
 * Ничего не рисует.
 */
export function MusicEditorIdentity({ canEdit }: { canEdit: boolean }) {
  const player = useMusicPlayer();
  const setIsMusicEditor = player?.setIsMusicEditor;

  useEffect(() => {
    if (!setIsMusicEditor) return;
    setIsMusicEditor(canEdit);
    return () => setIsMusicEditor(false);
  }, [setIsMusicEditor, canEdit]);

  return null;
}
