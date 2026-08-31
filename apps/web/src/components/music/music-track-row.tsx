import Link from "next/link";
import type { MusicTrackDto } from "@vedamatch/shared";
import { formatTrackDuration } from "@/lib/music-duration";
import { MusicCover } from "./music-cover";
import { MusicFavoriteButton } from "./favorites-provider";
import { MusicPlayButton } from "./player/play-button";
import { MusicMarqueeText } from "@/components/music/marquee-text";

/**
 * Запись строкой — для списков внутри альбома, исполнителя и очереди.
 * Сетка плитками хороша для витрины, но программу на два десятка киртанов
 * ей не показать: там важен порядок, а не обложки.
 */
export function MusicTrackRow({
  track,
  position,
  queue,
}: {
  track: MusicTrackDto;
  /** Номер в программе. Без него порядок записи читается как случайный. */
  position?: number;
  /**
   * Записи секции. Со списком каталога строку надо уметь запустить прямо
   * отсюда: человек выбрал список ровно затем, чтобы не открывать каждую
   * запись по очереди.
   */
  queue?: string[];
}) {
  return (
    // Сердце — сосед ссылки, а не её содержимое: кнопка внутри ссылки это
    // вложенные интерактивные элементы, которые клавиатура и скринридер
    // разбирают по-разному. Место под него держит правый отступ ссылки.
    <div className="group relative flex items-center">
      <Link
        href={`/music/tracks/${track.id}`}
        className="flex flex-1 items-center gap-3 rounded-xl py-2 pl-2 pr-12 transition-colors hover:bg-glass"
      >
        {position !== undefined && (
          <span className="w-6 shrink-0 text-right font-mono text-xs text-text-2">
            {position}
          </span>
        )}
        <span className="h-10 w-10 shrink-0 overflow-hidden rounded-lg">
          <MusicCover
            url={track.coverUrl}
            seed={track.id}
            alt={`Обложка: ${track.title}`}
            rounded="rounded-lg"
          />
        </span>
        {/* Титрами, а не многоточием: в списке альбома названия длинные и
            похожие друг на друга началом — «Avantika devi dasi — …» обрывалось
            ровно там, где начиналась разница. Строка едет только если не
            помещается, и стоит под `prefers-reduced-motion`. */}
        <span className="flex min-w-0 flex-col">
          <MusicMarqueeText
            text={track.title}
            className="text-sm font-semibold text-text-0"
          />
          <MusicMarqueeText
            text={track.artist?.name ?? "Исполнитель не указан"}
            className="text-xs text-text-2"
          />
        </span>
        <span className="ml-auto shrink-0 font-mono text-xs text-text-2">
          {formatTrackDuration(track.durationSeconds)}
        </span>
      </Link>

      {/* Кнопка запуска поверх обложки и снаружи ссылки — по той же причине,
          что и сердце: вложенные интерактивные элементы клавиатура и
          скринридер разбирают по-разному. Видна всегда, а не по наведению:
          на телефоне наведения нет, а список выбирают как раз на телефоне.
          Отступ слева считается от `pl-2` ссылки и номера, если он есть. */}
      {queue && (
        <MusicPlayButton
          trackId={track.id}
          title={track.title}
          queue={queue}
          className={`absolute ${
            position !== undefined ? "left-11" : "left-2"
          } flex h-10 w-10 items-center justify-center rounded-lg bg-black/45 text-white`}
        />
      )}

      <MusicFavoriteButton
        trackId={track.id}
        title={track.title}
        className="absolute right-1 shrink-0"
      />
    </div>
  );
}
