"use client";

import { useRouter } from "next/navigation";
import type {
  LibraryLocale,
  LineageId,
  SpiritualStage,
} from "@vedamatch/shared";
import { MaterialMarksButton } from "@/components/material-marks-button";
import {
  setLibraryEntryAudienceStages,
  setLibraryEntryLineage,
} from "@/lib/library-admin-api";
import { t } from "./i18n";

/** Разметка материала: ступени и линия. */
export interface EntryMarks {
  stages: SpiritualStage[];
  lineage: LineageId | null;
}

/**
 * Один значок фильтров у материала Образования (VED-715), у всех
 * участников: ступени самоидентификации и духовная линия — в одном окне,
 * как «Фильтры материалов» на главной. Участник видит индикацию,
 * администратор Образования (`canSet`, право приходит с сервера) — полный
 * выбор с сохранением маршрутами админки `library/admin/entries/:id/…`,
 * каждым своим.
 *
 * `onChanged` — для карточки в ленте: та держит разметку у себя и
 * перерисовывает чип линии сама. Без него страница перечитывается.
 */
export function EntryMarksButtons({
  locale,
  entryId,
  audienceStages,
  lineage,
  canSet,
  onChanged,
  sizeClassName,
}: {
  locale: LibraryLocale;
  entryId: string;
  audienceStages: readonly SpiritualStage[];
  lineage: LineageId | null;
  canSet?: boolean;
  onChanged?: (marks: EntryMarks) => void;
  /** Размер кнопки; по умолчанию 44px. */
  sizeClassName?: string;
}) {
  const router = useRouter();

  function changed(marks: EntryMarks) {
    if (onChanged) onChanged(marks);
    else router.refresh();
  }

  return (
    <MaterialMarksButton
      stages={audienceStages}
      subjects={[
        {
          title: t(locale, "lineage.infoMaterial"),
          lineage,
          emptyLabel: t(locale, "lineage.badgeAll"),
        },
      ]}
      sizeClassName={sizeClassName}
      onSaveStages={
        canSet
          ? async (next) => {
              const result = await setLibraryEntryAudienceStages(
                entryId,
                next,
              );
              changed({ stages: result.audienceStages, lineage });
            }
          : undefined
      }
      onSaveLineage={
        canSet
          ? async (next) => {
              const result = await setLibraryEntryLineage(entryId, next);
              changed({
                stages: [...audienceStages],
                lineage: result.lineage,
              });
            }
          : undefined
      }
    />
  );
}
