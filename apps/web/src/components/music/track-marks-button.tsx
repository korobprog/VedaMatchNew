"use client";

import { useRouter } from "next/navigation";
import type { LineageId, SpiritualStage } from "@vedamatch/shared";
import { MaterialMarksMenuButton } from "@/components/material-marks-menu-button";
import { updateMusicTrack } from "@/lib/music-admin-client-api";

/**
 * «Разметка» (отпечаток пальца) на странице записи — только редакции Музыки
 * (VED-616): ступени самоидентификации и линия записи в одном окне, одним
 * запросом правки записи.
 */
export function MusicTrackMarksButton({
  trackId,
  audienceStages,
  lineage,
  canEdit,
  className,
}: {
  trackId: string;
  audienceStages: readonly SpiritualStage[];
  lineage: LineageId | null;
  canEdit: boolean;
  className?: string;
}) {
  const router = useRouter();
  if (!canEdit) return null;

  return (
    <MaterialMarksMenuButton
      stages={audienceStages}
      lineage={lineage}
      menuLabel="Разметка записи"
      className={className}
      onSave={async (next) => {
        await updateMusicTrack(trackId, {
          audienceStages: next.stages,
          lineage: next.lineage,
        });
        router.refresh();
      }}
    />
  );
}
