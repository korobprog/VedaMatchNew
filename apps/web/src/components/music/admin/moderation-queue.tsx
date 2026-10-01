"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type {
  MusicArtistDto,
  MusicCategoryDto,
  MusicModerationItemDto,
} from "@vedamatch/shared";
import { MusicBulkArtistBar } from "./bulk-artist-bar";
import { selectionState, toggleAllShown } from "./bulk-artist";
import { MusicModerationCard } from "./moderation-card";

/**
 * Очередь модерации с массовым выбором записей (VED-688).
 *
 * Очередь — первая страница админки Медиатеки, и именно отсюда модератор
 * привязывает исполнителя: партию заливает один человек, чаще всего под одной
 * программой, и повторять одно и то же имя в каждой карточке — ровно та
 * работа, ради которой массовый выбор и делают. Выбор здесь тот же, что в
 * списке «Все записи» (VED-226): галочка в карточке, «выбрать все» над
 * списком и панель `MusicBulkArtistBar`, которая шлёт тот же
 * `POST tracks/artist`.
 *
 * Одиночные карточки не меняются: без пропса `selection` галочки нет и всё
 * происходит как раньше.
 */
export function MusicModerationQueue({
  items,
  artists,
  categories,
}: {
  items: MusicModerationItemDto[];
  artists: MusicArtistDto[];
  categories: MusicCategoryDto[];
}) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set());

  const known = useMemo(
    () => new Set(items.map((item) => item.track.id)),
    [items],
  );
  /* Записи, ушедшие из очереди после `router.refresh()` (опубликованы или
     отклонены), из выбора выпадают — иначе панель обещала бы перенести то,
     чего в очереди уже нет, а сервер ответил бы 404. */
  const selectedIds = [...selected].filter((id) => known.has(id));
  const shownIds = items.map((item) => item.track.id);
  const allState = selectionState(shownIds, selected);

  const toggleOne = (id: string) =>
    setSelected((was) => {
      const next = new Set(was);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <>
      <MusicBulkArtistBar
        selectedIds={selectedIds}
        artists={artists}
        onClear={() => setSelected(new Set())}
      />

      {items.length > 1 && (
        <SelectAllShown
          state={allState}
          count={items.length}
          onToggle={() => setSelected((was) => toggleAllShown(shownIds, was))}
        />
      )}

      <ul className="space-y-4">
        {items.map((item) => (
          <MusicModerationCard
            key={item.track.id}
            item={item}
            artists={artists}
            categories={categories}
            selection={{
              selected: selected.has(item.track.id),
              onToggle: () => toggleOne(item.track.id),
            }}
          />
        ))}
      </ul>
    </>
  );
}

/** Общая галочка над очередью — тем же приёмом, что и в «Всех записях». */
function SelectAllShown({
  state,
  count,
  onToggle,
}: {
  state: "none" | "some" | "all";
  count: number;
  onToggle: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = state === "some";
  }, [state]);
  return (
    <label className="mb-1 flex min-h-9 items-center gap-2 px-1 text-sm text-text-1">
      <input
        ref={ref}
        type="checkbox"
        checked={state === "all"}
        onChange={onToggle}
        className="size-4"
      />
      Выбрать все показанные ({count})
    </label>
  );
}
