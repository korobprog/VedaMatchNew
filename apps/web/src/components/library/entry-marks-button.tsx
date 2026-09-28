"use client";

import { useRouter } from "next/navigation";
import type { LineageId, SpiritualStage } from "@vedamatch/shared";
import { MaterialMarksMenuButton } from "@/components/material-marks-menu-button";
import {
  setLibraryEntryAudienceStages,
  setLibraryEntryLineage,
} from "@/lib/library-admin-api";
import { sameAudienceStages } from "@/lib/audience-stages";
import type { MaterialMarks } from "@/lib/material-marks";

/**
 * «Разметка» (отпечаток пальца) в ряду действий материала — только
 * администратору Образования (VED-616): ступени самоидентификации и линия
 * в одном окне. Право приходит с сервера (`canSetLineage`), без него кнопки
 * нет вовсе. Сохраняет маршрутами админки `library/admin/entries/:id/…` —
 * только то, что изменилось.
 *
 * `onChanged` — для карточки в ленте: та держит разметку у себя и
 * перерисовывает чип линии сама. Без него страница перечитывается.
 */
export function EntryMarksButton({
  entryId,
  audienceStages,
  lineage,
  canSet,
  onChanged,
  className,
  sizeClassName,
}: {
  entryId: string;
  audienceStages: readonly SpiritualStage[];
  lineage: LineageId | null;
  canSet?: boolean;
  onChanged?: (marks: MaterialMarks) => void;
  className?: string;
  /** Размер кнопки; по умолчанию 44px. */
  sizeClassName?: string;
}) {
  const router = useRouter();
  if (!canSet) return null;

  return (
    <MaterialMarksMenuButton
      stages={audienceStages}
      lineage={lineage}
      className={className}
      sizeClassName={sizeClassName}
      onSave={async (next) => {
        let saved: MaterialMarks = {
          stages: [...audienceStages],
          lineage,
        };
        if (!sameAudienceStages(next.stages, audienceStages)) {
          const result = await setLibraryEntryAudienceStages(
            entryId,
            next.stages,
          );
          saved = { ...saved, stages: result.audienceStages };
        }
        if (next.lineage !== lineage) {
          const result = await setLibraryEntryLineage(entryId, next.lineage);
          saved = { ...saved, lineage: result.lineage };
        }
        if (onChanged) onChanged(saved);
        else router.refresh();
      }}
    />
  );
}
