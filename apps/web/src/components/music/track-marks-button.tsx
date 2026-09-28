"use client";

import { useRouter } from "next/navigation";
import type { LineageId, SpiritualStage } from "@vedamatch/shared";
import { LineageInfoButton } from "@/components/lineage-info-button";
import { MaterialStagesButton } from "@/components/material-stages-button";
import { updateMusicTrack } from "@/lib/music-admin-client-api";

/**
 * Пара значков на странице записи (VED-632), у всех участников: отпечаток
 * пальца — для каких ступеней самоидентификации запись, домик — к какой
 * линии запись и её исполнитель. Редакции Музыки (`canEdit`) те же окна
 * дают поменять и сохранить ступени и линию записи — запросом правки записи.
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
    <>
      <MaterialStagesButton
        stages={audienceStages}
        menuLabel="Самоидентификация записи"
        onSave={
          canEdit
            ? async (next) => {
                await updateMusicTrack(trackId, { audienceStages: next });
                router.refresh();
              }
            : undefined
        }
      />
      <LineageInfoButton
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
        onSave={
          canEdit
            ? async (next) => {
                await updateMusicTrack(trackId, { lineage: next });
                router.refresh();
              }
            : undefined
        }
      />
    </>
  );
}
