import Link from "next/link";
import type { MusicTrackDto } from "@vedamatch/shared";
import { formatTrackDuration } from "@/lib/music-duration";
import { MusicCover } from "./music-cover";
import { MusicFavoriteButton } from "./favorites-provider";
import { MusicPlayRow } from "./player/play-row";
import { MusicMarqueeText } from "@/components/music/marquee-text";

/**
 * Запись строкой — для списков внутри альбома, исполнителя и очереди.
 * Сетка плитками хороша для витрины, но программу на два десятка киртанов
 * ей не показать: там важен порядок, а не обложки.
 *
 * Строка запускает запись, а не открывает карточку: список выбирают затем,
 * чтобы слушать подряд, и лишний переход на каждой записи ломал ровно это.
 * Карточка осталась — компактным значком справа, рядом с сердцем.
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
   * Записи секции. Без неё «дальше» ведёт в пустоту: очередь состоит из
   * одной записи, и кнопки переключения в полосе плеера гаснут. Страница,
   * рисующая список, обязана её передать — иначе список не переключается.
   */
  queue?: string[];
}) {
  return (
    // Сердце и значок карточки — соседи кнопки, а не её содержимое:
    // интерактивное внутри интерактивного клавиатура и скринридер разбирают
    // по-разному. Место под них держит правый отступ кнопки.
    <div className="group relative flex items-center">
      <MusicPlayRow
        trackId={track.id}
        title={track.title}
        queue={queue}
        glyphClassName={position !== undefined ? "left-11" : "left-2"}
        // `min-w-0` обязателен: без него флекс-элемент не сжимается меньше
        // своего содержимого, длинное название вылезает за строку и наезжает
        // на значки справа, а титры не включаются — им кажется, что места
        // хватает.
        className="flex min-w-0 flex-1 items-center gap-3 rounded-xl py-2 pl-2 pr-20 text-left transition-colors hover:bg-glass"
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
        {/* На телефоне длительность уступает место названию: узнать запись
            важнее, чем заранее знать её длину, а строка одна на двоих. */}
        <span className="ml-auto hidden shrink-0 font-mono text-xs text-text-2 sm:inline">
          {formatTrackDuration(track.durationSeconds)}
        </span>
      </MusicPlayRow>

      {/* Карточка записи — текст, плейлисты, сон-таймер, жалоба. Значок, а не
          строка целиком: слушать хотят чаще, чем читать о записи. Видна
          всегда: на телефоне наведения нет, а список смотрят как раз с
          телефона. */}
      <Link
        href={`/music/tracks/${track.id}`}
        aria-label={`Карточка записи: ${track.title}`}
        className="absolute right-9 flex h-8 w-8 items-center justify-center rounded-lg text-text-2 hover:text-text-0"
      >
        <svg
          viewBox="0 0 24 24"
          className="h-4 w-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="9" />
          <path d="M12 11v5M12 8h.01" />
        </svg>
      </Link>

      <MusicFavoriteButton
        trackId={track.id}
        title={track.title}
        className="absolute right-1 shrink-0"
      />
    </div>
  );
}
