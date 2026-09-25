import type { UnionRecommendation, UnionSwipeDecision } from '@vedamatch/shared';

/**
 * Состояние колоды свайпов — чистая функция, как на сайте было бы полезно
 * иметь с самого начала (`swipe-deck.tsx`, там это размазано по трём
 * `useState`).
 *
 * Колода помнит решённых по id, а не текущую позицию по счёту. По счёту
 * нельзя: решение уходит на сервер, выдача перечитывается уже без этой
 * анкеты — список съезжает на единицу, а указатель остаётся, и одно нажатие
 * «познакомиться» съедало бы двоих (дефект сайта, описан в `swipe-deck.tsx`).
 */
export interface DeckState {
  /** Кого уже решили — в порядке решений, последний можно вернуть. */
  decided: string[];
  /** Позиция среди ещё не решённых. */
  cursor: number;
}

export type DeckAction =
  /** Решение по текущей анкете: она уходит, на её место встаёт следующая. */
  | { type: 'decide' }
  /** Листание без решения: на сервер ничего не уходит, анкета не отсмотрена. */
  | { type: 'browse'; delta: 1 | -1 }
  /** Сервер снял последнее решение — анкета возвращается на своё место. */
  | { type: 'undo' }
  /** Новый круг: пропуски сняты, колода с начала. */
  | { type: 'reset' };

function clamp(value: number, length: number): number {
  return Math.min(Math.max(0, value), Math.max(0, length - 1));
}

/** Начальное состояние. Позицию зажимаем: плитка могла отдать её из прошлой выдачи. */
export function initialDeckState(items: readonly UnionRecommendation[], initialIndex = 0): DeckState {
  return { decided: [], cursor: clamp(initialIndex, items.length) };
}

/** Кто ещё в колоде. Решённые не возвращаются, даже если выдача принесла их снова. */
export function visibleItems(items: readonly UnionRecommendation[], state: DeckState): UnionRecommendation[] {
  const decided = new Set(state.decided);
  return items.filter((item) => !decided.has(item.user.id));
}

export function deckView(items: readonly UnionRecommendation[], state: DeckState) {
  const visible = visibleItems(items, state);
  return {
    visible,
    current: visible[state.cursor] as UnionRecommendation | undefined,
    next: visible[state.cursor + 1] as UnionRecommendation | undefined,
    /** «3 из 12» — сколько осталось посмотреть в этой колоде. */
    position: visible.length === 0 ? 0 : state.cursor + 1,
    canBrowseBack: state.cursor > 0,
    canBrowseForward: state.cursor < visible.length - 1,
  };
}

export function deckReducer(items: readonly UnionRecommendation[], state: DeckState, action: DeckAction): DeckState {
  const visible = visibleItems(items, state);
  switch (action.type) {
    case 'decide': {
      const current = visible[state.cursor];
      if (!current) return state;
      const decided = [...state.decided, current.user.id];
      // Позиция не двигается: на место решённого встаёт следующий. Но если
      // решили последнего из тех, кого пролистали вперёд, указатель
      // упирается в конец — тогда шаг назад, к ещё не решённому, а не
      // «круг пройден» при живых анкетах позади (на сайте так и было).
      return { decided, cursor: clamp(state.cursor, visible.length - 1) };
    }
    case 'browse': {
      const target = state.cursor + action.delta;
      if (target < 0 || target >= visible.length) return state;
      return { ...state, cursor: target };
    }
    case 'undo': {
      if (state.decided.length === 0) return state;
      const restored = state.decided[state.decided.length - 1];
      const rest = state.decided.slice(0, -1);
      // Возвращённый встаёт на своё место в порядке выдачи, и указатель идёт
      // к нему: иначе откат показывал бы соседа, а не того, кого вернули.
      const position = visibleItems(items, { decided: rest, cursor: 0 }).findIndex(
        (item) => item.user.id === restored,
      );
      return { decided: rest, cursor: position < 0 ? 0 : position };
    }
    case 'reset':
      return { decided: [], cursor: 0 };
  }
}

/** Подсказка после решения. Пропуск молчит: сообщать не о чем. */
export function swipeResultMessage(decision: UnionSwipeDecision, matched: boolean): string | null {
  if (decision === 'pass') return null;
  if (matched) return 'Взаимно! Чат открыт';
  return decision === 'superlike' ? 'Суперлайк отправлен' : 'Запрос отправлен';
}

/** Сколько подсказка держится на экране, мс. */
export const TOAST_MS = 2200;

export interface BurstRay {
  /** Смещение конца луча от центра. */
  dx: number;
  dy: number;
  /** Задержка вылета, мс: салют распускается, а не выстреливает разом. */
  delayMs: number;
}

/**
 * Лучи салюта на взаимность — перенос `deck-burst.ts`: равномерно по кругу,
 * с разной длиной и задержкой. Формулой, а не `Math.random()`: разница
 * глазу не видна, а тест остаётся детерминированным.
 */
export function burstRays(count: number, radius: number): BurstRay[] {
  if (count <= 0 || radius <= 0) return [];
  return Array.from({ length: count }, (_, i) => {
    const angle = (2 * Math.PI * i) / count;
    // Шаг 5 по модулю 7 обходит все остатки — длины вразнобой, а не волной.
    // Верхняя доля 0.96: самый длинный луч не касается габарита салюта.
    const length = radius * (0.6 + (0.36 * ((i * 5) % 7)) / 6);
    return { dx: Math.cos(angle) * length, dy: Math.sin(angle) * length, delayMs: (i % 4) * 50 };
  });
}
