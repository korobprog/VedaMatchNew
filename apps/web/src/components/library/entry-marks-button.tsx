"use client";

import { useRouter } from "next/navigation";
import type {
  LibraryLocale,
  LineageId,
  SpiritualStage,
} from "@vedamatch/shared";
import { LineageInfoButton } from "@/components/lineage-info-button";
import { MaterialStagesButton } from "@/components/material-stages-button";
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
 * Пара значков у материала Образования (VED-632), у всех участников:
 * отпечаток пальца — для каких ступеней самоидентификации материал, домик —
 * к какой духовной линии. Администратору Образования (`canSet`, право
 * приходит с сервера) те же окна дают поменять и сохранить — маршрутами
 * админки `library/admin/entries/:id/…`, каждое своё.
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
  /** Размер кнопок; по умолчанию 44px. */
  sizeClassName?: string;
}) {
  const router = useRouter();

  function changed(marks: EntryMarks) {
    if (onChanged) onChanged(marks);
    else router.refresh();
  }

  return (
    <>
      <MaterialStagesButton
        stages={audienceStages}
        sizeClassName={sizeClassName}
        onSave={
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
      />
      <LineageInfoButton
        subjects={[
          {
            title: t(locale, "lineage.infoMaterial"),
            lineage,
            emptyLabel: t(locale, "lineage.badgeAll"),
          },
        ]}
        sizeClassName={sizeClassName}
        onSave={
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
    </>
  );
}
