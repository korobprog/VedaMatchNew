"use client";

import { useRouter } from "next/navigation";
import type { SpiritualStage } from "@vedamatch/shared";
import { AudienceStagesMenuButton } from "@/components/audience-stages-menu-button";
import { setLibraryEntryAudienceStages } from "@/lib/library-admin-api";

/**
 * «Ступени» в ряду действий материала (VED-575) — только администратору
 * Образования: право то же, что у «Линии» (`canSetLineage` с сервера), и без
 * него кнопки нет вовсе. Сохраняет маршрутом админки
 * `library/admin/entries/:id/audience-stages`.
 *
 * `onChanged` — для карточки в ленте: та держит разметку у себя. Без него
 * страница перечитывается с сервера.
 */
export function EntryAudienceButton({
  entryId,
  audienceStages,
  canSet,
  onChanged,
  className,
  sizeClassName,
}: {
  entryId: string;
  audienceStages: readonly SpiritualStage[];
  canSet?: boolean;
  onChanged?: (stages: SpiritualStage[]) => void;
  className?: string;
  /** Размер кнопки; по умолчанию 44px. */
  sizeClassName?: string;
}) {
  const router = useRouter();
  if (!canSet) return null;

  return (
    <AudienceStagesMenuButton
      value={audienceStages}
      className={className}
      sizeClassName={sizeClassName}
      onSave={async (next) => {
        const saved = await setLibraryEntryAudienceStages(entryId, next);
        if (onChanged) onChanged(saved.audienceStages);
        else router.refresh();
      }}
    />
  );
}
