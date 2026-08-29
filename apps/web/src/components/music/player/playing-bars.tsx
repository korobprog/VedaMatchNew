/**
 * Столбики «идёт воспроизведение» — тот же значок, которым макеты ленты
 * друзей отмечают «слушает», только живой.
 *
 * Это украшение, а не эквалайзер: звук здесь не анализируется. Настоящий
 * эквалайзер план сервиса отвергает прямо — он требует Web Audio-графа на
 * весь поток и ломает Media Session. Столбики говорят ровно одно: «играет»,
 * и стоят ноль процессора.
 *
 * Для скринридера значок невидим: состояние воспроизведения уже сказано
 * кнопкой пуска, и второй голос об одном и том же только мешает.
 */

/**
 * Высоты и темпы столбиков.
 *
 * Подобраны разными и не кратными друг другу: с одинаковыми столбики ходят
 * строем, и значок читается как заставка «загрузка», а не как звучащая
 * музыка. Смещение старта — чтобы они не начинали с одной точки.
 */
const BARS = [
  { height: 7, duration: 780, delay: 0 },
  { height: 13, duration: 1080, delay: 160 },
  { height: 9, duration: 900, delay: 320 },
  { height: 15, duration: 1240, delay: 80 },
  { height: 8, duration: 840, delay: 240 },
];

export function MusicPlayingBars({
  playing,
  className = "",
}: {
  playing: boolean;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={`flex items-end gap-[3px] ${playing ? "" : "music-eq-paused"} ${className}`}
    >
      {BARS.map((bar, at) => (
        <span
          key={at}
          className="music-eq-bar w-[3px] rounded-full bg-violet"
          style={{
            height: bar.height,
            animationDuration: `${bar.duration}ms`,
            animationDelay: `${bar.delay}ms`,
          }}
        />
      ))}
    </span>
  );
}
