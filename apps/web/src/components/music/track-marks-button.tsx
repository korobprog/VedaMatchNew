"use client";

import { useRouter } from "next/navigation";
import type { LineageId, SpiritualStage } from "@vedamatch/shared";
import { MaterialMarksButton } from "@/components/material-marks-button";
import { updateMusicTrack } from "@/lib/music-admin-client-api";

/**
 * Один значок фильтров на странице записи (VED-715), у всех участников:
 * ступени самоидентификации и духовная линия — записи и её исполнителя —
 * раскрываются в одном окне. Участник видит индикацию, редакции Музыки
 * (`canEdit`) те же фильтры дают поменять и сохранить запросом правки
 * записи.
 */
export function MusicTrackMarksButtons({
  trackId,
  audienceStages,
  lineage,
  artistLineage,
  canEdit,
}: {
  trackId: string;
  audienceStages: readonly SpiritualStage[];
  lineage: LineageId | null;
  /** Линия исполнителя; `undefined` — исполнителя у записи нет. */
  artistLineage?: LineageId | null;
  canEdit: boolean;
}) {
  const router = useRouter();

  return (
    <MaterialMarksButton
      stages={audienceStages}
      menuLabel="Фильтры записи"
      subjects={[
        { title: "Запись", lineage },
        ...(artistLineage !== undefined
          ? [
              {
                title: "Исполнитель",
                lineage: artistLineage,
                emptyLabel: "Линия не указана",
              },
            ]
          : []),
      ]}
      onSaveStages={
        canEdit
          ? async (next) => {
              await updateMusicTrack(trackId, { audienceStages: next });
              router.refresh();
            }
          : undefined
      }
      onSaveLineage={
        canEdit
          ? async (next) => {
              await updateMusicTrack(trackId, { lineage: next });
              router.refresh();
            }
          : undefined
      }
    />
  );
}
