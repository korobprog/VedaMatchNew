"use client";

import { useRouter } from "next/navigation";
import type { SpiritualStage } from "@vedamatch/shared";
import { AudienceStagesMenuButton } from "@/components/audience-stages-menu-button";
import { updateMusicTrack } from "@/lib/music-admin-client-api";

/**
 * «Ступени» у записи Медиатеки (VED-575) — только редакции Музыки: право
 * проверяет страница (`canAdminService(…, "music")`) и сервер, у маршрута
 * `music/admin/catalog/tracks/:id` своя проверка. Без права кнопки нет.
 */
export function MusicTrackAudienceButton({
  trackId,
  audienceStages,
  canEdit,
  className,
}: {
  trackId: string;
  audienceStages: readonly SpiritualStage[];
  canEdit: boolean;
  className?: string;
}) {
  const router = useRouter();
  if (!canEdit) return null;

  return (
    <AudienceStagesMenuButton
      value={audienceStages}
      className={className}
      onSave={async (next) => {
        await updateMusicTrack(trackId, { audienceStages: next });
        router.refresh();
      }}
    />
  );
}
