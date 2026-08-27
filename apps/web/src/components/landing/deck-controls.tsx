/**
 * Ряд решений под карточкой витрины — копия панели из колоды Знакомств
 * (`components/union/swipe-deck.tsx`).
 *
 * Именно копия, а не импорт: компоненты сервиса лендингу не принадлежат,
 * общее здесь дублируется — docs/service-module-contract.md. Расплата за это
 * — расхождение при правке колоды, поэтому фигуры и корпус кнопок описаны
 * теми же значениями, что там, и правятся парой.
 *
 * Витрина обязана показывать те же пять элементов, что видит участник:
 * пропустить, вернуть анкету, кольцо совместимости, суперлайк и знакомство.
 * Меньше — и гость приходит в сервис к незнакомому экрану.
 */

/** Корпус кнопки: блик сверху, затемнение к низу, светлая рамка и тень. */
export const DECK_BUTTON =
  "flex shrink-0 items-center justify-center rounded-full border border-white/30 bg-gradient-to-b from-white/25 to-black/35 shadow-[inset_0_1px_0_rgba(255,255,255,0.45),inset_0_-2px_4px_rgba(0,0,0,0.35),0_6px_16px_rgba(0,0,0,0.5)] backdrop-blur-md transition";

export function HeartIcon() {
  return (
    <svg width="30" height="30" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 21.2c-.4 0-.8-.15-1.1-.42C6.3 16.7 3 13.6 3 9.7 3 6.6 5.4 4.2 8.4 4.2c1.5 0 2.8.62 3.6 1.6.8-.98 2.1-1.6 3.6-1.6 3 0 5.4 2.4 5.4 5.5 0 3.9-3.3 7-7.9 11.08-.3.27-.7.42-1.1.42Z" />
    </svg>
  );
}

/**
 * Пламя суперлайка. Как и сердце — своя фигура, а не эмодзи: системный 🔥 в
 * ряду нарисованных кнопок оставался единственным цветным пятном чужого
 * стиля и менялся от устройства к устройству.
 */
export function FlameIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M13.4 2.2c.3 2.6-.6 4.3-2.3 6-1.9 1.9-3 3.6-3 5.9a6 6 0 0 0 11.5 2.4c1-2.4.4-5-1.2-7.2-.4 1-1.1 1.7-2 2 .5-3.4-.8-6.4-3-9.1Z" />
      <path d="M9.6 13.8c-1 .9-1.6 2-1.6 3.3a4 4 0 0 0 4 4c-1.3-1-2-2.2-2-3.6 0-1.3.5-2.4 1.4-3.4-.6.2-1.3 0-1.8-.3Z" />
    </svg>
  );
}

/**
 * Из чего складывается процент. Веса — копия WEIGHTS из
 * `apps/api/src/modules/union/union-matching.service.ts`, сумма 100.
 *
 * Это свойство алгоритма, а не данные человека, поэтому показывать их гостю
 * можно честно: витрина обещает расчёт — и тут же предъявляет его устройство.
 * Разойдутся с сервером — разойдутся и цифры в разборе, поэтому правятся
 * парой; сумму стережёт тест.
 */
export const COMPATIBILITY_CRITERIA: Array<{ label: string; weight: number }> = [
  { label: "Цели знакомства", weight: 25 },
  { label: "Духовный этап", weight: 15 },
  { label: "Образ жизни", weight: 15 },
  { label: "Ценности", weight: 13 },
  { label: "Интересы", weight: 12 },
  { label: "Локация", weight: 10 },
  { label: "Формат общения", weight: 10 },
];

/** Звёзды — вход в сверку карт. Своя фигура, как у сердца и пламени рядом. */
export function StarsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2.6l1.7 4.2 4.5.3-3.4 2.9 1 4.4-3.8-2.4-3.8 2.4 1-4.4-3.4-2.9 4.5-.3z" />
      <path d="M18.4 14.6l.8 1.9 2 .2-1.5 1.3.5 2-1.8-1.1-1.8 1.1.5-2-1.5-1.3 2-.2z" />
    </svg>
  );
}

const RADIUS = 26;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/**
 * Процент совместимости кольцом — центр панели решений, как и в сервисе: это
 * единственная цифра, ради которой стоит задержаться на анкете. По нажатию
 * раскрывается разбор: проценту без объяснения верят ровно один раз.
 *
 * `total === null` — процент неизвестен: он считается относительно
 * смотрящего, а гость ещё не вошёл. Кольцо тогда пустое, а вместо цифры —
 * знак вопроса. Подставить сюда красивое число значило бы приписать расчёт
 * живому человеку с витрины, которого никто не делал.
 */
export function CompatibilityRing({
  total,
  size,
  expanded,
  onClick,
}: {
  total: number | null;
  size: number;
  expanded: boolean;
  onClick: () => void;
}) {
  const filled =
    total === null ? 0 : (Math.min(100, Math.max(0, total)) / 100) * CIRCUMFERENCE;

  return (
    <button
      type="button"
      data-deck-action="ring"
      onClick={onClick}
      aria-expanded={expanded}
      aria-label={
        total === null
          ? "Показать, из чего складывается совместимость"
          : `Совместимость ${total}%. Показать, из чего она сложилась`
      }
      style={{ width: size, height: size }}
      className={`${DECK_BUTTON} relative`}
    >
      <svg viewBox="0 0 64 64" className="absolute inset-0 h-full w-full">
        <circle
          cx="32"
          cy="32"
          r={RADIUS}
          fill="none"
          stroke="currentColor"
          strokeWidth="4"
          className="text-white/20"
        />
        {total !== null && (
          <circle
            cx="32"
            cy="32"
            r={RADIUS}
            fill="none"
            stroke="var(--vm-magenta)"
            strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray={`${filled} ${CIRCUMFERENCE}`}
            // Отсчёт от двенадцати часов по часовой стрелке, как в сервисе.
            transform="rotate(-90 32 32)"
          />
        )}
      </svg>
      <span className="relative font-mono text-sm font-bold text-white">
        {total === null ? "?" : `${total}%`}
      </span>
    </button>
  );
}

/** Одна строка разбора: критерий, его оценка и вес в общей сумме. */
export interface BreakdownRow {
  label: string;
  weight: number;
  /** null — оценки нет: считать её не для кого, пока гость не вошёл. */
  score: number | null;
}

/**
 * Разбор процента поверх фото — как в колоде сервиса. Цвета не токены темы, а
 * белый по затемнению: под панелью произвольный снимок.
 */
export function CompatibilityBreakdown({
  total,
  rows,
  onClose,
}: {
  total: number | null;
  rows: BreakdownRow[];
  onClose: () => void;
}) {
  return (
    <div className="absolute inset-0 z-30 flex flex-col rounded-3xl bg-black/85 p-4 backdrop-blur-sm">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="font-display text-base font-bold text-white">
          {total === null ? "Как считается совместимость" : `Почему ${total}%`}
        </p>
        <button
          type="button"
          data-deck-action="close"
          onClick={onClose}
          aria-label="Закрыть разбор совместимости"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/15 text-white transition hover:bg-white/25"
        >
          <span aria-hidden="true">✕</span>
        </button>
      </div>

      <dl className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
        {rows.map((row) => (
          <div key={row.label}>
            <div className="flex items-baseline justify-between gap-2">
              <dt className="text-xs text-white/85">{row.label}</dt>
              <dd className="font-mono text-xs font-semibold text-white">
                {row.score === null ? `вес ${row.weight}%` : `${row.score}%`}
              </dd>
            </div>
            <span className="mt-1 block h-1 overflow-hidden rounded-full bg-white/20">
              <span
                className="block h-full rounded-full bg-gradient-to-r from-magenta to-[#B23EFF]"
                // Без оценки полоса показывает вес критерия: это и есть всё,
                // что известно про расчёт до входа.
                style={{ width: `${row.score ?? row.weight}%` }}
              />
            </span>
          </div>
        ))}
      </dl>

      {/*
        Оговорка стоит всегда, а не только при пустом кольце. Любой процент
        на витрине — пример: настоящий считается относительно смотрящего, а
        гость ещё не вошёл. Без этой строки число рядом с именем живого
        человека читалось бы как расчёт про него.
      */}
      <p className="mt-2 shrink-0 text-[11px] leading-snug text-white/60">
        Числа для примера. Ваш процент считается относительно вас — он появится
        здесь после входа.
      </p>
    </div>
  );
}
