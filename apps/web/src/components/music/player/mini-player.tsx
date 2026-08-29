"use client";

import { useState } from "react";
import Link from "next/link";
import { formatTrackDuration } from "@/lib/music-duration";
import { MusicCover } from "@/components/music/music-cover";
import { MusicMarqueeText } from "@/components/music/marquee-text";
import { SEEK_STEP_SECONDS, useMusicPlayer } from "./player-provider";
import { MusicQueuePanel } from "./queue-panel";

/**
 * Полоса плеера внизу экрана. См. макет `.design/music/MiniPlayer.dc.html`.
 *
 * Показывается, только когда есть что играть: пустая полоса занимала бы
 * место на каждой странице портала ради ничего. Отступ снизу — по
 * `safe-area`, иначе на телефоне её съедает системная полоса жестов.
 *
 * Кнопки — настоящие `<button>` с именами: в макете это кружки без текста, и
 * скринридер иначе прочитал бы полосу как набор безымянных кнопок. Мелкие
 * значки внутри помечены `aria-hidden` — имя несёт сама кнопка.
 */

/** Скорости из плана: лекции ускоряют, киртаны — нет, но одна кнопка дешевле двух режимов. */
const RATES = [1, 1.25, 1.5, 2, 0.75] as const;

const icon = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

export function MiniPlayer() {
  const player = useMusicPlayer();
  const [queueOpen, setQueueOpen] = useState(false);

  // Полосы нет ни у гостя, ни когда слушать нечего.
  if (!player?.current) return null;

  const {
    current,
    isPlaying,
    positionSeconds,
    durationSeconds,
    repeat,
    shuffle,
    rate,
    volume,
    muted,
    isPrivateSession,
    isFavorite,
    hasNext,
    hasPrev,
  } = player;

  const total = durationSeconds || current.durationSeconds;
  // `shrink-0` не для красоты: без него флекс ужимал кнопки в правой группе
  // до 17px по ширине при заявленных 32, а цель меньше 24×24 не проходит по
  // WCAG 2.5.8 — и пальцем в неё не попасть безо всякого стандарта.
  const ctrl =
    "flex shrink-0 items-center justify-center rounded-full text-text-1 transition-colors hover:text-text-0 disabled:opacity-40";

  return (
    <div
      // `pointer-events-none` на обёртке, чтобы прозрачные поля по краям не
      // перехватывали клики по странице под полосой.
      //
      // `data-music-player` — зацепка для `body:has(...)` в globals.css:
      // полоса лежит поверх страницы, и без отступа снизу последняя строка
      // любого раздела портала оказывалась под ней.
      data-music-player=""
      className="pointer-events-none fixed inset-x-0 bottom-0 z-40 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
    >
      <section
        aria-label="Плеер"
        // На телефоне полоса в две строки, как в макете Main.dc.html: в одну
        // строку 390px не помещаются ни девять кнопок, ни дорожка — название
        // записи сжималось в ноль. Поэтому здесь `flex-wrap` и порядок
        // элементов задан явно, а с `sm` возвращается однострочная раскладка
        // из PortalWide.dc.html.
        className="glass pointer-events-auto mx-auto flex max-w-5xl flex-wrap items-center gap-x-3 gap-y-1.5 rounded-2xl px-3 py-2 sm:h-16 sm:flex-nowrap sm:gap-5 sm:px-[18px] sm:py-0"
      >
        {/* Что играет */}
        <div className="order-1 flex min-w-0 flex-1 items-center gap-3 sm:order-none sm:w-56 sm:flex-none">
          <Link
            href={`/music/tracks/${current.id}`}
            aria-label={`Открыть запись: ${current.title}`}
            className="h-10 w-10 shrink-0 overflow-hidden rounded-[10px]"
          >
            <MusicCover
              url={current.coverUrl}
              seed={current.id}
              alt=""
              rounded="rounded-[10px]"
            />
          </Link>
          <div className="flex min-w-0 flex-col">
            {/* Название едет титрами, когда не помещается: полоса узкая, а
                «Мир Прокисший (Prod. by…» не даёт узнать запись. Ключ по
                названию — чтобы при смене записи строка начинала сначала, а
                не доезжала остаток предыдущей. */}
            <MusicMarqueeText
              key={current.id}
              text={current.title}
              className="text-[13px] font-semibold text-text-0"
            />
            <span className="truncate text-[11px] text-text-2">
              {current.artist?.name ?? "Исполнитель не указан"}
            </span>
          </div>
        </div>

        {/* Управление и дорожка.
            `contents` на телефоне: обёртка перестаёт быть коробкой, и кнопки
            с дорожкой становятся прямыми детьми полосы — только так дорожка
            может уехать на свою строку во всю ширину. С `sm` обёртка снова
            коробка, и колонка «кнопки над дорожкой» из макета возвращается. */}
        <div className="contents sm:flex sm:flex-1 sm:flex-col sm:items-center sm:gap-1.5">
          <div className="order-3 flex items-center gap-1.5 sm:order-none sm:gap-2">
            <button
              type="button"
              aria-label="Перемешать"
              aria-pressed={shuffle}
              onClick={player.toggleShuffle}
              className={`${ctrl} hidden h-7 w-7 sm:flex ${shuffle ? "text-violet" : "text-text-2"}`}
            >
              <svg {...icon} className="h-[15px] w-[15px]">
                <path d="M16 3l4 4-4 4" />
                <path d="M20 7H8a4 4 0 0 0-4 4v1" />
                <path d="M8 21l-4-4 4-4" />
                <path d="M4 17h12a4 4 0 0 0 4-4v-1" />
              </svg>
            </button>

            <button
              type="button"
              aria-label={`Назад на ${SEEK_STEP_SECONDS} секунд`}
              onClick={() => player.skip(-SEEK_STEP_SECONDS)}
              // Видно и на телефоне: лекцию и киртан на сорок минут слушают
              // именно с телефона, а попасть пальцем в нужную секунду на
              // трёхпиксельной дорожке нельзя.
              className={`${ctrl} h-10 w-10 sm:h-8 sm:w-8`}
            >
              <svg {...icon} className="h-4 w-4">
                <path d="M11 4L3 12l8 8" />
                <path d="M21 12H4" />
              </svg>
            </button>

            <button
              type="button"
              aria-label="Предыдущая запись"
              disabled={!hasPrev}
              onClick={player.prev}
              className={`${ctrl} hidden h-8 w-8 sm:flex`}
            >
              <svg {...icon} className="h-4 w-4">
                <path d="M19 4L9 12l10 8z" />
                <path d="M5 5v14" />
              </svg>
            </button>

            <button
              type="button"
              aria-label={isPlaying ? "Пауза" : "Воспроизвести"}
              onClick={player.toggle}
              // 44px на телефоне — и размер из макета, и минимальная цель
              // пальца; на широком экране полоса всего 64px высотой, там 40.
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-mint-edge bg-mint text-on-mint sm:h-10 sm:w-10"
            >
              {isPlaying ? (
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor" aria-hidden="true">
                  <rect x="6" y="4" width="4" height="16" rx="1" />
                  <rect x="14" y="4" width="4" height="16" rx="1" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor" aria-hidden="true">
                  <path d="M7 4l13 8-13 8z" />
                </svg>
              )}
            </button>

            <button
              type="button"
              aria-label="Следующая запись"
              disabled={!hasNext}
              onClick={player.next}
              className={`${ctrl} h-10 w-10 sm:h-8 sm:w-8`}
            >
              <svg {...icon} className="h-4 w-4">
                <path d="M5 4l10 8-10 8z" />
                <path d="M19 5v14" />
              </svg>
            </button>

            <button
              type="button"
              aria-label={`Вперёд на ${SEEK_STEP_SECONDS} секунд`}
              onClick={() => player.skip(SEEK_STEP_SECONDS)}
              className={`${ctrl} h-10 w-10 sm:h-8 sm:w-8`}
            >
              <svg {...icon} className="h-4 w-4">
                <path d="M13 4l8 8-8 8" />
                <path d="M3 12h17" />
              </svg>
            </button>

            <button
              type="button"
              aria-label={
                repeat === "off"
                  ? "Повтор выключен"
                  : repeat === "all"
                    ? "Повтор очереди"
                    : "Повтор одной записи"
              }
              onClick={() =>
                player.setRepeat(
                  repeat === "off" ? "all" : repeat === "all" ? "one" : "off",
                )
              }
              className={`${ctrl} hidden h-7 w-7 sm:flex ${repeat === "off" ? "text-text-2" : "text-violet"}`}
            >
              <svg {...icon} className="h-[15px] w-[15px]">
                <path d="M17 2l4 4-4 4" />
                <path d="M3 11v-1a4 4 0 0 1 4-4h14" />
                <path d="M7 22l-4-4 4-4" />
                <path d="M21 13v1a4 4 0 0 1-4 4H3" />
              </svg>
              {repeat === "one" && (
                <span className="absolute mt-4 font-mono text-[8px]">1</span>
              )}
            </button>
          </div>

          <PositionSlider
            position={positionSeconds}
            total={total}
            onSeek={player.seek}
          />
        </div>

        {/* Скорость, сердце, очередь, невидимый сеанс, громкость.
            На телефоне остаются скорость, сердце и невидимый сеанс: первые
            две — из макета, третья — потому что «сейчас меня не видно» надо
            уметь нажать там же, где слушаешь, а не уходить за этим в
            настройки. Очередь и громкость не влезают: очередь есть на
            широком экране и в карточке на главной, громкость на телефоне
            системная. */}
        <div className="order-2 flex shrink-0 items-center gap-2 sm:order-none sm:w-56 sm:justify-end sm:gap-2.5">
          <button
            type="button"
            aria-label={`Скорость ${rate.toFixed(2).replace(/0$/, "")}×, сменить`}
            onClick={() =>
              player.setRate(RATES[(RATES.indexOf(rate as 1) + 1) % RATES.length])
            }
            // Видно и на телефоне: лекцию слушают на 1.5×, и это ровно тот
            // случай, когда переключатель нужен под рукой.
            className="flex h-8 items-center rounded-full border border-glass-brd px-2.5 text-[11px] font-semibold text-text-1 hover:text-text-0 sm:h-7"
          >
            {rate.toFixed(2).replace(/0$/, "").replace(/\.$/, "")}×
          </button>

          <button
            type="button"
            aria-label={isFavorite ? "Убрать из избранного" : "В избранное"}
            aria-pressed={isFavorite}
            onClick={player.toggleFavorite}
            className={`${ctrl} h-10 w-10 sm:h-8 sm:w-8 ${isFavorite ? "text-magenta" : "text-text-2"}`}
          >
            <svg
              viewBox="0 0 24 24"
              className="h-4 w-4"
              fill={isFavorite ? "currentColor" : "none"}
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M19 14c1.5-1.5 3-3.3 3-5.5A5.5 5.5 0 0 0 12 5.6 5.5 5.5 0 0 0 2 8.5c0 2.2 1.5 4 3 5.5l7 7z" />
            </svg>
          </button>

          <div className="relative hidden sm:block">
            <button
              type="button"
              aria-label="Очередь"
              aria-expanded={queueOpen}
              onClick={() => setQueueOpen((was) => !was)}
              className={`${ctrl} h-8 w-8 ${queueOpen ? "text-violet" : "text-text-2"}`}
            >
              <svg {...icon} className="h-4 w-4">
                <path d="M3 6h11M3 12h8M3 18h8M17 12v8M13 16h8" />
              </svg>
            </button>
            {queueOpen && <MusicQueuePanel onClose={() => setQueueOpen(false)} />}
          </div>

          {/* Плейлисты — этап 4. До него это ссылка на карточку записи: тот же
              портально-безопасный адрес, что у кнопки в ленте друзей. */}
          <Link
            href={`/music/tracks/${current.id}?add=1`}
            aria-label="В плейлист"
            className={`${ctrl} hidden h-8 w-8 text-text-2 lg:flex`}
          >
            <svg {...icon} className="h-4 w-4">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </Link>

          <button
            type="button"
            aria-label={
              isPrivateSession
                ? "Невидимый сеанс включён — друзья не видят"
                : "Включить невидимый сеанс"
            }
            aria-pressed={isPrivateSession}
            onClick={player.togglePrivateSession}
            className={`${ctrl} h-10 w-10 sm:h-8 sm:w-8 ${isPrivateSession ? "text-gold" : "text-text-2"}`}
          >
            <svg {...icon} className="h-4 w-4">
              {isPrivateSession ? (
                <>
                  <path d="M2 2l20 20" />
                  <path d="M6.7 6.7A10.5 10.5 0 0 0 1 12s4 7 11 7a10.6 10.6 0 0 0 5.3-1.4" />
                  <path d="M9.9 4.2A10.9 10.9 0 0 1 12 4c7 0 11 7 11 7a17 17 0 0 1-3.3 4" />
                </>
              ) : (
                <>
                  <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z" />
                  <circle cx="12" cy="12" r="3" />
                </>
              )}
            </svg>
          </button>

          {/* На телефоне громкость системная — ползунок прячем, кнопку нет. */}
          <button
            type="button"
            aria-label={muted ? "Включить звук" : "Выключить звук"}
            aria-pressed={muted}
            onClick={player.toggleMuted}
            className={`${ctrl} hidden h-8 w-8 text-text-2 sm:flex`}
          >
            <svg {...icon} className="h-4 w-4">
              <path d="M11 5L6 9H2v6h4l5 4z" />
              {muted ? (
                <path d="M22 9l-6 6M16 9l6 6" />
              ) : (
                <path d="M15.5 8.5a5 5 0 0 1 0 7" />
              )}
            </svg>
          </button>

          <label className="hidden items-center lg:flex">
            <span className="sr-only">Громкость</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={muted ? 0 : volume}
              onChange={(event) => player.setVolume(Number(event.target.value))}
              className="h-6 w-16 cursor-pointer appearance-none bg-transparent [&::-webkit-slider-runnable-track]:h-[3px] [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:bg-glass-brd [&::-webkit-slider-thumb]:mt-[-4.5px] [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-text-1"
            />
          </label>
        </div>
      </section>
    </div>
  );
}

/**
 * Дорожка. Ползунок настоящий, а не полоска с обработчиком клика: он даёт
 * стрелки, Home/End и объявление позиции без единой строки кода.
 *
 * Видимая линия — 3px, как в макете, но сам элемент высотой 24px: цель
 * меньше 24×24 не проходит по WCAG 2.5.8, а попасть пальцем в три пикселя
 * не выйдет и без всякого стандарта.
 */
function PositionSlider({
  position,
  total,
  onSeek,
}: {
  position: number;
  total: number;
  onSeek: (seconds: number) => void;
}) {
  const percent = total > 0 ? Math.min(100, (position / total) * 100) : 0;

  return (
    <div className="order-4 flex w-full items-center gap-2 sm:order-none sm:w-[340px]">
      <span className="font-mono text-[10px] tabular-nums text-text-2">
        {formatTrackDuration(position)}
      </span>
      <label className="relative flex min-w-0 flex-1 items-center">
        <span className="sr-only">Позиция записи</span>
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 h-[3px] overflow-hidden rounded-full bg-glass-brd"
        >
          <span
            className="block h-full rounded-full bg-violet"
            style={{ width: `${percent}%` }}
          />
        </span>
        <input
          type="range"
          min={0}
          max={Math.max(1, total)}
          step={1}
          value={position}
          // Время словами: «128» в объявлении читалки бесполезно.
          aria-valuetext={`${formatTrackDuration(position)} из ${formatTrackDuration(total)}`}
          onChange={(event) => onSeek(Number(event.target.value))}
          className="relative h-6 w-full cursor-pointer appearance-none bg-transparent [&::-webkit-slider-runnable-track]:h-[3px] [&::-webkit-slider-runnable-track]:bg-transparent [&::-webkit-slider-thumb]:mt-[-4.5px] [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-violet"
        />
      </label>
      <span className="font-mono text-[10px] tabular-nums text-text-2">
        {formatTrackDuration(total)}
      </span>
    </div>
  );
}
