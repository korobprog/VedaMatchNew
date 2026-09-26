import Link from "next/link";
import type { MusicTrackDto } from "@vedamatch/shared";
import { formatTrackDuration } from "@/lib/music-duration";
import { MusicCover } from "./music-cover";
import { MusicPlayRow } from "./player/play-row";
import { MusicFavoriteButton } from "./favorites-provider";

/**
 * Запись строкой — для списков внутри альбома, исполнителя и очереди.
 * Сетка плитками хороша для витрины, но программу на два десятка киртанов
 * ей не показать: там важен порядок, а не обложки.
 *
 * Строка запускает запись, а не открывает карточку: список выбирают затем,
 * чтобы слушать подряд, и лишний переход на каждой записи ломал ровно это.
 * Карточка осталась — компактным значком справа.
 *
 * Справа — сердце, значок карточки и время (VED-531). Сердце вернулось:
 * заказчик попросил отмечать прямо из списка. Время при этом осталось крайним
 * справа и не ужалось — по нему отличают короткий бхаджан от часовой
 * программы (VED-113); место под сердце отдано названию, а полное название
 * видно в карточке записи.
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
    // Значок карточки — сосед кнопки, а не её содержимое: интерактивное
    // внутри интерактивного клавиатура и скринридер разбирают по-разному.
    // Место под него и под время держит правый отступ кнопки.
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
        className="flex min-w-0 flex-1 items-center gap-3 rounded-xl py-2 pl-2 pr-28 text-left transition-colors hover:bg-glass"
      >
        {position !== undefined && (
          <span className="w-6 shrink-0 text-right font-mono text-xs text-text-2 in-data-current:text-violet">
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
        {/* Названия неподвижны, с многоточием (VED-531): бегущие строки в
            длинном списке рябили, а полное название видно в карточке записи —
            значок «i» справа. */}
        <span className="flex min-w-0 flex-col">
          {/* Название играющей записи — цветом строки (VED-141). Признак
              ставит кнопка: плеер знает её состояние, а эта строка серверная. */}
          <span className="truncate text-sm font-semibold text-text-0 in-data-current:text-violet">
            {track.title}
          </span>
          <span className="truncate text-xs text-text-2">
            {track.artist?.name ?? "Исполнитель не указан"}
          </span>
        </span>
      </MusicPlayRow>

      {/* Правый край строки (VED-531): сердце, значок карточки и время —
          вплотную, значок «i» у самого времени. Ряд сквозной для нажатий:
          тап между кнопками и по времени — тап по строке, то есть запуск.

          Карточка записи — текст, плейлисты, сон-таймер, жалоба. Значок, а не
          строка целиком: слушать хотят чаще, чем читать о записи. Видна
          всегда: на телефоне наведения нет, а список смотрят как раз с
          телефона. Сердце без избранного (гость, ответ ещё не пришёл) не
          рисуется вовсе. */}
      <span className="pointer-events-none absolute right-2 flex items-center">
        <MusicFavoriteButton
          trackId={track.id}
          title={track.title}
          className="pointer-events-auto size-8!"
        />
        <Link
          href={`/music/tracks/${track.id}`}
          aria-label={`Карточка записи: ${track.title}`}
          className="pointer-events-auto flex h-8 w-8 items-center justify-center rounded-lg text-text-2 hover:text-text-0"
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
        {/* Время — крайним справа. Под «59:59» ровно; часовая программа
            («1:12:40») сдвигает значки левее на пару знаков. */}
        <span className="min-w-9 text-right font-mono text-xs text-text-2">
          {formatTrackDuration(track.durationSeconds)}
        </span>
      </span>
    </div>
  );
}
