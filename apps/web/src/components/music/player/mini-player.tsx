"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { formatTrackDuration } from "@/lib/music-duration";
import { MusicCover } from "@/components/music/music-cover";
import { MusicMarqueeText } from "@/components/music/marquee-text";
import { MusicPositionSlider } from "@/components/music/player/position-slider";
import { MusicPlayingBars } from "./playing-bars";
import { SEEK_STEP_SECONDS, useMusicPlayer } from "./player-provider";
import { MusicPlayGlyph, playButtonLabel } from "./play-glyph";
import { MusicSleepCountdown } from "./sleep-countdown";
import { MusicQueuePanel } from "./queue-panel";
import { useHoldSeek } from "./use-hold-seek";

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

/**
 * Свёрнута ли полоса. Помним между переходами и перезагрузками: иначе
 * человек сворачивает её на каждой странице заново, и сворачивание теряет
 * весь смысл.
 */
const COLLAPSED_KEY = "vedamatch:music-player-collapsed";

export function MiniPlayer() {
  const player = useMusicPlayer();
  const pathname = usePathname();
  const [queueOpen, setQueueOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  /* Читаем эффектом, а не ленивым `useState`: на сервере `localStorage` нет,
     инициализатор вернул бы «развёрнута», а на клиенте — «свёрнута», и это
     расхождение гидратации. Тем же способом читает своё значение провайдер
     плеера и `theme-provider`. */
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- см. комментарий
       выше: ленивый useState здесь даёт расхождение гидратации. Тот же
       приём и та же причина, что в `player-provider.tsx` и
       `theme-provider.tsx`. */
    try {
      if (window.localStorage.getItem(COLLAPSED_KEY) === "1") {
        setCollapsed(true);
      }
    } catch {
      // Приватный режим и запрет хранилища — не повод не работать.
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  const toggleCollapsed = () => {
    setCollapsed((was) => {
      const next = !was;
      try {
        window.localStorage.setItem(COLLAPSED_KEY, next ? "1" : "0");
      } catch {
        // см. выше
      }
      return next;
    });
  };

  /* Перемотка удержанием — до всех ранних возвратов: порядок хуков не
     зависит от того, есть ли что играть. Обёртка вокруг `player.skip`
     нужна потому, что провайдер может быть ещё пуст, а хук объявляется
     раньше проверки. */
  const seekBy = useCallback(
    (seconds: number) => player?.skip(seconds),
    [player],
  );
  const holdPrev = useHoldSeek({
    direction: -1,
    seekBy,
    onTap: () => player?.prev(),
    disabled: !player?.hasPrev,
  });
  const holdNext = useHoldSeek({
    direction: 1,
    seekBy,
    onTap: () => player?.next(),
    disabled: !player?.hasNext,
  });

  // Полосы нет ни у гостя, ни когда слушать нечего.
  if (!player?.current) return null;

  // На главной портала полосу не рисуем: там стоит карточка Музыки со своим
  // управлением, и две панели одного плеера на одном экране спорят друг с
  // другом. Прячем по пути, а не пропсом из layout: полоса монтируется в
  // корневом layout один раз на всё приложение, и там про страницы ничего
  // не известно.
  if (pathname === "/") return null;

  const {
    current,
    isPlaying,
    isLoading,
    loadError,
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

  // Ожидание важнее «играет»: пока звука нет, полоса не должна показывать
  // паузу — это единственная кнопка, по которой судят, сработало ли нажатие.
  const playState = isLoading ? "loading" : isPlaying ? "playing" : "paused";

  /* Длина очереди — в имени кнопки, а не значком поверх неё: значок в углу
     кружка 40×40 нечитаем, а скринридеру он не говорит вообще ничего. */
  const queueLength = player.queue.length;

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
      // Свёрнутой полосе нужно меньше места, и отступ страницы обязан
      // следовать за ней: иначе под полоской в 48 точек остаётся дыра в 150.
      // Правило — в globals.css рядом с основным.
      data-collapsed={collapsed ? "true" : "false"}
      className="pointer-events-none fixed inset-x-0 bottom-0 z-40 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
    >
      {collapsed ? (
        /* Свёрнутая полоска: обложка, название и пуск. Всё остальное — в
           развёрнутом виде и на странице записи. Смысл ровно один: «не
           мешай, но играй», поэтому здесь нет ни дорожки, ни перемотки. */
        <section
          aria-label="Плеер, свёрнут"
          className="player-bar pointer-events-auto mx-auto flex h-12 max-w-5xl items-center gap-2.5 rounded-2xl px-2.5"
        >
          <Link
            href={`/music/tracks/${current.id}`}
            aria-label={`Открыть запись: ${current.title}`}
            className="size-8 shrink-0 overflow-hidden rounded-lg"
          >
            <MusicCover
              url={current.coverUrl}
              seed={current.id}
              alt=""
              rounded="rounded-lg"
            />
          </Link>

          <MusicMarqueeText
            key={current.id}
            text={current.title}
            className="min-w-0 flex-1 text-[13px] font-semibold text-text-0"
          />

          <MusicPlayingBars
            playing={isPlaying}
            className="h-3.5 w-14 shrink-0 max-[380px]:hidden"
          />

          <button
            type="button"
            aria-label={playButtonLabel(playState)}
            onClick={player.toggle}
            className="flex size-9 shrink-0 items-center justify-center rounded-full border border-mint-edge bg-mint text-on-mint"
          >
            <MusicPlayGlyph state={playState} className="size-3" />
          </button>

          <button
            type="button"
            aria-label="Развернуть плеер"
            aria-expanded={false}
            onClick={toggleCollapsed}
            className={`${ctrl} size-8`}
          >
            <svg {...icon} className="size-4">
              <path d="M18 15l-6-6-6 6" />
            </svg>
          </button>

          <button
            type="button"
            aria-label="Закрыть плеер"
            onClick={player.close}
            className={`${ctrl} size-8`}
          >
            <svg {...icon} className="size-4">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </section>
      ) : (
      <section
        aria-label="Плеер"
        // На телефоне полоса в две строки, как в макете Main.dc.html: в одну
        // строку 390px не помещаются ни девять кнопок, ни дорожка — название
        // записи сжималось в ноль. Поэтому здесь `flex-wrap` и порядок
        // элементов задан явно, а с `sm` возвращается однострочная раскладка
        // из PortalWide.dc.html.
        className="player-bar pointer-events-auto mx-auto flex max-w-5xl flex-wrap items-center gap-x-3 gap-y-1.5 rounded-2xl px-3 py-2 sm:h-16 sm:flex-nowrap sm:gap-5 sm:px-[18px] sm:py-0"
      >
        {/* Что играет */}
        <div className="order-1 flex min-w-0 flex-1 items-center gap-3 sm:order-none sm:w-40 sm:flex-none lg:w-56">
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
            {/* Причина отказа вытесняет исполнителя, а не приписывается
                рядом: место под ней одно, и в ту секунду, когда запись не
                играет, имя исполнителя человеку не нужно. `role="status"` —
                чтобы отказ прочитал и скринридер: для него молчащая кнопка
                вообще ничем не отличается от работающей. */}
            {loadError ? (
              <span
                role="status"
                className="truncate text-[11px] text-magenta"
                title={loadError}
              >
                {loadError}
              </span>
            ) : (
              <span className="truncate text-[11px] text-text-2">
                {current.artist?.name ?? "Исполнитель не указан"}
              </span>
            )}
          </div>
        </div>

        {/* Разрыв строки на телефоне. `flex-wrap` переносит только то, что не
            влезло, а здесь строку надо кончить раньше: иначе управление
            встаёт рядом с названием и оба сжимаются в ноль. Пустая полоска во
            всю ширину и нулевой высоты — единственный способ сказать это
            флексу. */}
        <span aria-hidden="true" className="order-3 h-0 w-full sm:hidden" />

        {/* Управление и дорожка.
            `contents` на телефоне: обёртка перестаёт быть коробкой, и кнопки
            с дорожкой становятся прямыми детьми полосы — только так дорожка
            может уехать на свою строку во всю ширину. С `sm` обёртка снова
            коробка, и колонка «кнопки над дорожкой» из макета возвращается. */}
        <div className="contents sm:flex sm:min-w-0 sm:flex-1 sm:flex-col sm:items-center sm:gap-1.5">
          {/* На телефоне ряд делит вторую строку с кнопками записи: `flex-1`
              отдаёт ему остаток места, но не выталкивает соседей на третью
              строку. На `sm` ширина снова по содержимому — там ряд стоит по
              центру колонки. */}
          <div className="order-4 flex min-w-0 flex-1 items-center gap-1.5 sm:order-none sm:w-auto sm:flex-none sm:gap-2">
            <button
              type="button"
              aria-label="Перемешать"
              aria-pressed={shuffle}
              onClick={player.toggleShuffle}
              className={`${ctrl} hidden h-7 w-7 lg:flex ${shuffle ? "text-violet" : "text-text-2"}`}
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
              // Только на широком экране. На телефоне место в ряду занимает
              // переход по записям: перемотка там есть и без кнопки — пальцем
              // по дорожке, — а перейти к соседней записи было нечем, и
              // единственный способ сменить киртан шёл через список.
              className={`${ctrl} hidden h-10 w-10 sm:h-8 sm:w-8 lg:flex`}
            >
              <svg {...icon} className="h-4 w-4">
                <path d="M11 4L3 12l8 8" />
                <path d="M21 12H4" />
              </svg>
            </button>

            <button
              type="button"
              aria-label={
                hasPrev
                  ? "Предыдущая запись, удержание — перемотка назад"
                  : "Перемотка назад удержанием"
              }
              title="Нажать — предыдущая запись, удержать — перемотка назад"
              // `aria-disabled`, а не `disabled`: перемотка относится к
              // играющей записи, а не к очереди, и на единственной записи
              // настоящий `disabled` отнял бы вместе с переходом и её —
              // отключённая кнопка не получает событий указателя вовсе.
              aria-disabled={!hasPrev}
              {...holdPrev.props}
              // Пара к «Следующей»: без неё промах по «дальше» стоил бы
              // возврата в список, а на телефоне это весь экран.
              className={`${ctrl} h-10 w-10 touch-none select-none aria-disabled:opacity-40 sm:h-8 sm:w-8 ${
                holdPrev.seeking ? "text-violet" : ""
              }`}
            >
              <svg {...icon} className="h-4 w-4">
                <path d="M19 4L9 12l10 8z" />
                <path d="M5 5v14" />
              </svg>
            </button>

            <button
              type="button"
              aria-label={playButtonLabel(playState)}
              onClick={player.toggle}
              // 44px на телефоне — и размер из макета, и минимальная цель
              // пальца; на широком экране полоса всего 64px высотой, там 40.
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-mint-edge bg-mint text-on-mint sm:h-10 sm:w-10"
            >
              <MusicPlayGlyph state={playState} />
            </button>

            <button
              type="button"
              aria-label={
                hasNext
                  ? "Следующая запись, удержание — перемотка вперёд"
                  : "Перемотка вперёд удержанием"
              }
              title="Нажать — следующая запись, удержать — перемотка вперёд"
              aria-disabled={!hasNext}
              {...holdNext.props}
              className={`${ctrl} h-10 w-10 touch-none select-none aria-disabled:opacity-40 sm:h-8 sm:w-8 ${
                holdNext.seeking ? "text-violet" : ""
              }`}
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
              className={`${ctrl} hidden h-10 w-10 sm:h-8 sm:w-8 lg:flex`}
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
              className={`${ctrl} relative hidden h-7 w-7 lg:flex ${repeat === "off" ? "text-text-2" : "text-violet"}`}
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

          <MusicPositionSlider
            className="order-6 flex w-full min-w-0 items-center gap-2 sm:order-none sm:w-full sm:max-w-[340px]"
            position={positionSeconds}
            total={total}
            onSeek={player.seek}
          />
        </div>

        {/* Скорость, сердце, очередь, невидимый сеанс, громкость.
            На телефоне остаются скорость, сердце, очередь и невидимый сеанс:
            первые две — из макета, очередь — потому что список того, что
            играет дальше, спрашивают именно с телефона, а на широкий экран и
            на главную портала за ним не уйти, третья — потому что «сейчас
            меня не видно» надо уметь нажать там же, где слушаешь. Не влезает
            только громкость: на телефоне она системная.

            `contents` на телефоне — тот же приём, что у управления с
            дорожкой: коробка перестаёт быть коробкой, и две её половины
            встают в разные строки полосы. Иначе шесть кнопок занимали первую
            строку целиком и название записи сжималось в ноль. На `sm`
            коробка снова коробка — правая колонка макета. */}
        <div className="contents sm:order-none sm:flex sm:w-auto sm:shrink-0 sm:items-center sm:justify-end sm:gap-2.5 lg:w-56">
          {/* Действия над записью — во второй строке, рядом с управлением:
              они про то, что играет, и стоят там же, где пуск и перемотка. */}
          <div className="order-5 flex shrink-0 items-center gap-1.5 sm:contents">
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

            <div className="relative">
              <button
                type="button"
                aria-label={
                  queueOpen ? "Закрыть очередь" : `Очередь, записей: ${queueLength}`
                }
                aria-expanded={queueOpen}
                aria-haspopup="dialog"
                onClick={() => setQueueOpen((was) => !was)}
                // 40 точек на телефоне — как у соседних кнопок ряда: цель
                // меньше 24×24 не проходит по WCAG 2.5.8, а 32 из макета
                // рассчитаны на мышь.
                className={`${ctrl} h-10 w-10 sm:h-8 sm:w-8 ${queueOpen ? "text-violet" : "text-text-2"}`}
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
              className={`${ctrl} hidden h-8 w-8 text-text-2 lg:flex`}
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

            {/* Отсчёт сон-таймера: не кнопка, а состояние. Появляется, только
                когда таймер заведён, поэтому места в обычной полосе не
                занимает и наложения не возвращает. Ставят таймер на карточке
                записи. */}
            <MusicSleepCountdown />
          </div>

          {/* Свернуть и закрыть — последними в группе, у самого края: это
              действия над самой полосой, а не над записью, и ставить их
              вперемешку с сердцем и скоростью значит путать два разных
              предмета. На телефоне они по той же причине остаются в первой
              строке — у названия записи, а не у кнопок управления. */}
          <div className="order-2 flex shrink-0 items-center gap-1 sm:contents">
            <button
              type="button"
              aria-label="Свернуть плеер"
              aria-expanded={true}
              onClick={toggleCollapsed}
              className={`${ctrl} h-9 w-9 text-text-2 sm:h-8 sm:w-8`}
            >
              <svg {...icon} className="h-4 w-4">
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>

            <button
              type="button"
              aria-label="Закрыть плеер"
              onClick={player.close}
              className={`${ctrl} h-9 w-9 text-text-2 sm:h-8 sm:w-8`}
            >
              <svg {...icon} className="h-4 w-4">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>
        </div>
      </section>
      )}
    </div>
  );
}

