"use client";

import { useRouter } from "next/navigation";
import type { LineageId } from "@vedamatch/shared";
import { LineageMenuButton } from "@/components/lineage-menu-button";
import { setLibraryEntryLineage } from "@/lib/library-admin-api";

/**
 * «Линия» в ряду действий материала (VED-561) — только администратору
 * Образования: признак `canSetLineage` приходит с сервера, и без него кнопки
 * нет вовсе. Сохраняет маршрутом админки `library/admin/entries/:id/lineage`.
 *
 * `onChanged` — для карточки в ленте: та перерисовывает чип линии сама.
 * Без него страница перечитывается с сервера.
 */
export function EntryLineageButton({
  entryId,
  lineage,
  canSetLineage,
  onChanged,
  className,
  sizeClassName,
}: {
  entryId: string;
  lineage: LineageId | null;
  canSetLineage?: boolean;
  onChanged?: (lineage: LineageId | null) => void;
  className?: string;
  /** Размер кнопки; по умолчанию 44px. */
  sizeClassName?: string;
}) {
  const router = useRouter();
  if (!canSetLineage) return null;

  return (
    <LineageMenuButton
      value={lineage}
      className={className}
      sizeClassName={sizeClassName}
      onSelect={async (next) => {
        const saved = await setLibraryEntryLineage(entryId, next);
        if (onChanged) onChanged(saved.lineage);
        else router.refresh();
      }}
    />
  );
}
