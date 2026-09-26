"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { MusicCategoryDto } from "@vedamatch/shared";
import { updateMusicArtist } from "@/lib/music-admin-client-api";

/**
 * Корневая категория исполнителя прямо на его странице — для редакции
 * (VED-165, пункт 4 списка тестировщика: «сделай функцию назначить
 * категорию — традиционное/современное — в карточке исполнителя»).
 *
 * Массовая разметка живёт в админке (`bulk-artist-root-category-bar.tsx`), и
 * она для другого случая: разметить справочник целиком. Здесь — точечная
 * правка того, кого редакция уже открыла: увидел «не в той вкладке» —
 * поправил на месте, не уходя в админку и не ища исполнителя в списке из
 * сотни строк.
 *
 * Отметка стоит у исполнителя, а не у записи: все его записи, включая
 * будущие, наследуют её автоматически.
 */
export function MusicArtistAdminCategory({
  artistId,
  artistName,
  rootCategoryId,
  categories,
}: {
  artistId: string;
  artistName: string;
  rootCategoryId: string | null;
  /** Полный список разделов каталога — корневые отбираются здесь. */
  categories: MusicCategoryDto[];
}) {
  const router = useRouter();
  const [value, setValue] = useState(rootCategoryId ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const roots = categories.filter((category) => category.kind === "root");

  async function save(next: string) {
    const was = value;
    setValue(next);
    setPending(true);
    setError(null);
    try {
      await updateMusicArtist(artistId, { rootCategoryId: next || null });
      router.refresh();
    } catch (cause) {
      // Сервер — источник истины: не сохранилось, возвращаем выбор как был,
      // иначе строка врёт о том, в какой вкладке теперь записи.
      setValue(was);
      setError(cause instanceof Error ? cause.message : "Не удалось сохранить");
    } finally {
      setPending(false);
    }
  }

  // Корневых категорий в справочнике нет — предлагать нечего.
  if (roots.length === 0) return null;

  return (
    <span className="flex flex-wrap items-center gap-1.5">
      <label className="flex items-center gap-1.5">
        <span className="sr-only">Категория исполнителя «{artistName}»</span>
        <select
          value={value}
          onChange={(event) => void save(event.target.value)}
          disabled={pending}
          className="h-8 rounded-full border border-glass-brd bg-bg-1 px-2.5 text-xs text-text-1 disabled:opacity-50"
        >
          <option value="">Всё</option>
          {roots.map((root) => (
            <option key={root.id} value={root.id}>
              {root.title}
            </option>
          ))}
        </select>
      </label>
      {error && <span className="text-xs text-text-1">{error}</span>}
    </span>
  );
}
