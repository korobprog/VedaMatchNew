/**
 * Ролик колоды Знакомств в макете телефона: курсор обходит три кнопки под
 * карточкой, на каждой рассказывает, что произойдёт, нажимает — и показывает
 * ответ сервиса.
 *
 * Шаги повторяют настоящие решения `swipe-deck.tsx`: pass, superlike, like —
 * и его же формулировки ответа («Суперлайк отправлен», «Запрос отправлен»,
 * «Взаимно! Чат открыт»). Витрина не имеет права обещать то, чего сервис не
 * делает, поэтому выдуманных кнопок здесь нет.
 */

/** Кнопка под карточкой. Совпадает с `data-deck-action` в SwipeCard. */
export type DeckAction =
  | "pass"
  | "undo"
  | "ring"
  | "superlike"
  | "like"
  | "astro"
  | "astro-business";

/**
 * Фаза одного шага:
 * - `telling` — курсор едет к кнопке, внизу читается реплика;
 * - `press` — нажатие;
 * - `reacting` — карточка ушла, виден ответ сервиса;
 * - `closing` — только у шага с разбором: курсор доехал до крестика и жмёт
 *   его. Панель, гаснущая сама, оставляла бы крестик нетронутым — а он
 *   ровно то, чем её закрывает живой человек.
 */
export type DeckPhase = "telling" | "press" | "reacting" | "closing";

export interface DeckStep {
  action: DeckAction;
  /** Что рассказываем до нажатия. */
  caption: string;
  /**
   * Ответ сервиса после нажатия. `null` — у «пропустить» и «вернуть» ответа
   * нет, и придумывать его нельзя: в сервисе они молчат.
   */
  reply: string | null;
  /**
   * Куда уходит колода. «Вернуть» листает назад — иначе кнопка возврата на
   * глазах у гостя делала бы ровно противоположное своему названию. `none` —
   * у кольца: разбор открывается поверх той же анкеты, и увести её из-под
   * разбора значило бы показать разбор чужого процента.
   */
  move: "next" | "prev" | "none";
  /**
   * Какую панель раскрыть поверх карточки: разбор процента Знакомств или
   * сверку карт по звёздам. Обе закрываются крестиком — фазой `closing`.
   */
  opens?: Exclude<DeckPanel, null>;
  /**
   * Сколько держать ответ, мс. Задаётся, когда стандартной паузы мало:
   * разбор из семи строк за полторы секунды не прочитать.
   */
  hold?: number;
}

export const DECK_STEPS: DeckStep[] = [
  {
    action: "pass",
    caption: "Не подошёл — анкета уходит, и человек об этом не узнает",
    reply: null,
    move: "next",
  },
  {
    action: "undo",
    caption: "Передумали — кнопка возврата приводит анкету обратно",
    reply: null,
    move: "prev",
  },
  {
    action: "ring",
    caption: "Процент в центре — не вайб: нажмите, и видно, из чего он сложился (числа для примера)",
    reply: null,
    move: "none",
    opens: "breakdown",
    hold: 3600,
  },
  {
    action: "superlike",
    caption: "Зацепила анкета — суперлайк заметнее обычного запроса",
    reply: "Суперлайк отправлен",
    move: "next",
  },
  {
    action: "like",
    caption: "Нравится — уходит запрос на знакомство",
    reply: "Запрос отправлен",
    move: "next",
  },
  {
    action: "like",
    caption: "А если интерес взаимный — открывается чат",
    reply: "Взаимно! Чат открыт",
    move: "next",
  },
  {
    action: "astro",
    caption: "Отсюда же карты сверяют по звёздам — и сперва спрашивают, ради чего",
    reply: null,
    move: "none",
    opens: "astroMenu",
    hold: 2200,
  },
  {
    action: "astro-business",
    caption: "Выбрали дело — и куты, которые про брак, в расчёт не идут",
    reply: null,
    move: "none",
    opens: "astro",
    hold: 3600,
  },
];

export interface DeckTourState {
  index: number;
  phase: DeckPhase;
}

export const DECK_TOUR_START: DeckTourState = { index: 0, phase: "telling" };

/**
 * Сколько живёт фаза, мс. `telling` длиннее прочих: это единственное время,
 * когда реплику успевают прочитать, а не просто увидеть движение курсора.
 */
export const DECK_DURATIONS: Record<DeckPhase, number> = {
  telling: 2600,
  press: 280,
  reacting: 1500,
  closing: 420,
};

/** Сколько едет курсор, мс. Короче фазы: доехал — и стоит, пока дочитывают. */
export const DECK_CURSOR_TRAVEL = 760;

/**
 * Следующее состояние. У шага с разбором между ответом и переходом вклинена
 * фаза закрытия — там курсор жмёт крестик; у остальных её нет, закрывать
 * нечего.
 */
export function nextDeckState(
  state: DeckTourState,
  steps: DeckStep[],
): DeckTourState {
  const nextStep = (): DeckTourState => ({
    index: (state.index + 1) % steps.length,
    phase: "telling",
  });

  switch (state.phase) {
    case "telling":
      return { index: state.index, phase: "press" };
    case "press":
      return { index: state.index, phase: "reacting" };
    case "reacting":
      return steps[state.index]?.opens
        ? { index: state.index, phase: "closing" }
        : nextStep();
    default:
      return nextStep();
  }
}

/**
 * Нажата ли кнопка прямо сейчас — для отклика кнопки и кольца курсора.
 * Закрытие разбора — такое же нажатие, просто по крестику.
 */
export function isDeckPressing(phase: DeckPhase): boolean {
  return phase === "press" || phase === "closing";
}

/**
 * Пора ли листать карточку. Ровно один переход на шаг — на входе в
 * `reacting`: сработай это на каждом кадре фазы, и колода улетела бы вперёд.
 */
export function shouldAdvanceCard(phase: DeckPhase): boolean {
  return phase === "reacting";
}

/** Ответ сервиса, если его пора показать. */
export function replyFor(state: DeckTourState, steps: DeckStep[]): string | null {
  if (state.phase !== "reacting") return null;
  return steps[state.index]?.reply ?? null;
}

/**
 * Раскрыт ли разбор совместимости — только на своём шаге и после нажатия.
 * Держится и в фазе закрытия: панель обязана быть на экране в момент, когда
 * курсор жмёт её крестик.
 */
/** Какая панель раскрыта поверх карточки; `null` — никакая. */
export type DeckPanel = "breakdown" | "astroMenu" | "astro" | null;

export function openPanel(
  state: DeckTourState,
  steps: DeckStep[],
): DeckPanel {
  if (state.phase !== "reacting" && state.phase !== "closing") return null;
  return steps[state.index]?.opens ?? null;
}

export function isBreakdownOpen(
  state: DeckTourState,
  steps: DeckStep[],
): boolean {
  return openPanel(state, steps) === "breakdown";
}

/** Раскрыта ли сверка карт по звёздам. */
export function isAstroOpen(
  state: DeckTourState,
  steps: DeckStep[],
): boolean {
  return openPanel(state, steps) === "astro";
}

/** Раскрыто ли меню целей сверки. */
export function isAstroMenuOpen(
  state: DeckTourState,
  steps: DeckStep[],
): boolean {
  return openPanel(state, steps) === "astroMenu";
}

/**
 * К чему едет курсор: к кнопке шага или к крестику раскрытого разбора.
 * Значение совпадает с `data-deck-action` в разметке.
 *
 * Про раскрытый разбор спрашиваем снаружи, а не выводим из шага: панель мог
 * открыть и сам гость, посреди чужого шага. Целься тогда курсор по шагу — он
 * тыкал бы в кнопки, спрятанные под панелью.
 */
export function cursorTarget(
  state: DeckTourState,
  steps: DeckStep[],
  panel: DeckPanel,
): DeckAction | "close" {
  // Меню целей — исключение: из него палец идёт не к крестику, а к самой
  // цели, иначе выбор бы никто не показал.
  if (panel === "astroMenu") {
    const next = steps[(state.index + 1) % steps.length]?.action;
    return next?.startsWith("astro-") ? next : "close";
  }
  if (panel !== null) return "close";
  return steps[state.index]?.action ?? "pass";
}

/** Длительность фазы с поправкой на шаг: разбору нужно больше времени. */
export function durationFor(state: DeckTourState, steps: DeckStep[]): number {
  if (state.phase === "reacting") {
    return steps[state.index]?.hold ?? DECK_DURATIONS.reacting;
  }
  return DECK_DURATIONS[state.phase];
}

/**
 * Сколько едет курсор к своей цели, мс. К крестику — быстрее: панель уже
 * прочитана, и медленный переезд читался бы как заминка.
 */
export function cursorTravelFor(phase: DeckPhase): number {
  return phase === "reacting" ? 520 : DECK_CURSOR_TRAVEL;
}
