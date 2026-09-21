"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { MusicArtistDto, MusicCategoryDto } from "@vedamatch/shared";
import { plural } from "@/lib/plural";
import { selectionState, toggleAllShown } from "./bulk-artist";
import { MusicBulkArtistAudiobookBar } from "./bulk-artist-audiobook-bar";
import { MusicBulkArtistRootCategoryBar } from "./bulk-artist-root-category-bar";
import { MusicReferenceList, type MusicReferenceRow } from "./reference-list";

const countLabel = (n: number) =>
  `${n} ${plural(n, "запись", "записи", "записей")}`;

/**
 * Раздел «Исполнители» справочников (VED-165-2): список с правкой и удалением
 * (`MusicReferenceList`) плюс выбор чекбоксами и массовая простановка
 * корневой категории — то, о чём тестировщик прямо попросил: «относить к
 * категории скопом», а не по одной записи.
 *
 * Отдельным клиентским компонентом, а не прямо на странице справочников: та
 * страница — серверный компонент, а выбор строк требует состояния на
 * клиенте, и заворачивать в клиентский компонент всю страницу ради одного
 * списка было бы дороже.
 */
export function MusicArtistCatalogPanel({
  artists,
  categories,
}: {
  artists: MusicArtistDto[];
  categories: MusicCategoryDto[];
}) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set());

  const known = useMemo(() => new Set(artists.map((a) => a.id)), [artists]);
  const selectedIds = [...selected].filter((id) => known.has(id));
  const allIds = artists.map((a) => a.id);
  const allState = selectionState(allIds, selected);
  const roots = useMemo(
    () => categories.filter((category) => category.kind === "root"),
    [categories],
  );

  const rows: MusicReferenceRow[] = artists.map((artist) => ({
    id: artist.id,
    primary: artist.name,
    secondary: countLabel(artist.trackCount),
    badge: artist.isVerified ? "проверен" : null,
    coverUrl: artist.coverUrl,
    rootCategoryId: artist.rootCategoryId,
    isAudiobook: artist.isAudiobook,
  }));

  return (
    <div>
      {artists.length > 0 && (
        <>
          {/* Корневая категория (VED-165-2) — только когда корневые заведены;
              раздел «Аудиокниги» (VED-237) справочника не требует, отметка
              живёт колонкой у самого исполнителя. */}
          {roots.length > 0 && (
            <MusicBulkArtistRootCategoryBar
              selectedIds={selectedIds}
              categories={categories}
              onClear={() => setSelected(new Set())}
            />
          )}
          <MusicBulkArtistAudiobookBar
            selectedIds={selectedIds}
            onClear={() => setSelected(new Set())}
          />
          <label className="mb-2 flex min-h-9 items-center gap-2 px-1 text-sm text-text-1">
            <SelectAllCheckbox
              state={allState}
              onToggle={() =>
                setSelected((was) => toggleAllShown(allIds, was))
              }
            />
            Выбрать всех ({artists.length})
          </label>
        </>
      )}
      <MusicReferenceList
        kind="artist"
        title="Исполнители"
        empty="Пока никого."
        rows={rows}
        rootCategories={roots}
        selection={{
          selectedIds: selected,
          onToggle: (id) =>
            setSelected((was) => {
              const next = new Set(was);
              if (next.has(id)) next.delete(id);
              else next.add(id);
              return next;
            }),
        }}
      />
    </div>
  );
}

function SelectAllCheckbox({
  state,
  onToggle,
}: {
  state: "none" | "some" | "all";
  onToggle: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = state === "some";
  }, [state]);
  return (
    <input
      ref={ref}
      type="checkbox"
      checked={state === "all"}
      onChange={onToggle}
      className="size-4"
    />
  );
}
