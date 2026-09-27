"use client";

import { useRouter } from "next/navigation";
import type { LineageId } from "@vedamatch/shared";
import { LineageMenuButton } from "@/components/lineage-menu-button";
import { updateMusicTrack } from "@/lib/music-admin-client-api";

/**
 * «Линия» у записи Медиатеки (VED-561) — только редакции Музыки: право
 * проверяет страница (`canAdminService(…, "music")`) и сервер, у маршрута
 * `music/admin/catalog/tracks/:id` своя проверка. Без права кнопки нет.
 */
export function MusicTrackLineageButton({
  trackId,
  lineage,
  canEdit,
  className,
}: {
  trackId: string;
  lineage: LineageId | null;
  canEdit: boolean;
  className?: string;
}) {
  const router = useRouter();
  if (!canEdit) return null;

  return (
    <LineageMenuButton
      value={lineage}
      className={className}
      onSelect={async (next) => {
        await updateMusicTrack(trackId, { lineage: next });
        router.refresh();
      }}
    />
  );
}
