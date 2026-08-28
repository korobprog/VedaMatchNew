"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { MusicPlaylistSheet } from "./music-playlist-sheet";

/**
 * Кнопка «В плейлист» на карточке записи и открытие шторки по `?add=1`.
 *
 * Параметр в адресе, а не только состояние кнопки: по такой ссылке сюда
 * приводят кнопка ленты друзей и полоса плеера. Компонент портала не имеет
 * права импортировать компоненты Музыки, поэтому обе они — обычные ссылки
 * `/music/tracks/:id?add=1`, и открывать шторку должна страница.
 *
 * При закрытии параметр снимается: иначе «назад» в браузере возвращал бы
 * шторку, а обновление страницы открывало её заново.
 */
export function MusicAddToPlaylist({
  trackId,
  trackTitle,
  artistName,
}: {
  trackId: string;
  trackTitle: string;
  artistName: string | null;
}) {
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  // Открытость выводится из адреса, а не переносится в состояние эффектом:
  // копия URL в useState даёт каскадный рендер и расходится с адресом на
  // «назад». Своё состояние нужно только для открытия кнопкой, когда
  // параметра в адресе нет вовсе.
  const [openedByButton, setOpenedByButton] = useState(false);
  const fromUrl = params.get("add") !== null;
  const open = openedByButton || fromUrl;

  const close = () => {
    setOpenedByButton(false);
    // Снимаем параметр: иначе «назад» возвращал бы шторку, а обновление
    // страницы открывало её заново. Снятый параметр сам закрывает шторку —
    // отдельного флага «закрыто» не нужно.
    if (fromUrl) {
      const rest = new URLSearchParams(params.toString());
      rest.delete("add");
      const query = rest.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, {
        scroll: false,
      });
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpenedByButton(true)}
        className="flex h-11 items-center gap-2 rounded-xl border border-glass-brd px-4 text-sm font-semibold text-text-1 transition-colors hover:text-text-0"
      >
        <svg
          viewBox="0 0 24 24"
          className="h-4 w-4 text-violet"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <path d="M3 6h11M3 12h8M3 18h8M17 12v8M13 16h8" />
        </svg>
        В плейлист
      </button>

      {open && (
        <MusicPlaylistSheet
          trackId={trackId}
          trackTitle={trackTitle}
          artistName={artistName}
          onClose={close}
        />
      )}
    </>
  );
}
