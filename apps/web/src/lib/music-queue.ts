/**
 * Очередь плеера: следующий и предыдущий трек.
 *
 * Копия `apps/api/src/modules/music/music-queue.ts`. Очередь живёт в
 * браузере, но сервер обязан считать следующий трек так же, когда отдаёт
 * состояние на другое устройство. Общего модуля между приложениями контракт
 * не даёт, поэтому дублирование осознанное — как транслитерация слага у
 * Рынка и Библиотеки. Правишь здесь — правь и там.
 *
 * Чистая функция от состояния, а не метод плеера: единственное, что здесь
 * можно перепутать, — это края очереди и сочетание shuffle с repeat, и
 * проверять это надо без звука, без React и без базы.
 *
 * Перестановка хранится списком позиций, а не пересортированной очередью:
 * выключение shuffle обязано вернуть исходный порядок, а не «тот, что
 * получился». По той же причине перестановка не той длины игнорируется —
 * очередь могли сменить, и выдавать позиции от прежней значит играть не то.
 */
export type MusicRepeatMode = 'off' | 'all' | 'one';

export interface QueueState {
  length: number;
  /** Позиция играющего трека в исходной очереди. */
  index: number;
  repeat: MusicRepeatMode;
  shuffle: boolean;
  /** Перестановка позиций; `null` — shuffle выключен. */
  order: number[] | null;
}

function positions(state: QueueState): number[] {
  if (state.shuffle && state.order && state.order.length === state.length) {
    return state.order;
  }
  return Array.from({ length: state.length }, (_, i) => i);
}

function step(state: QueueState, delta: 1 | -1): number | null {
  if (state.length <= 0) return null;

  // `repeat: one` отвечает раньше всего: он про «играй это же», а не про
  // движение по очереди, и на краях ведёт себя так же, как в середине.
  if (state.repeat === 'one') return state.index;

  const list = positions(state);
  const at = list.indexOf(state.index);
  // Позиции нет в очереди — состояние рассогласовано. Молчим, а не гадаем:
  // случайный трек тут хуже тишины.
  if (at === -1) return null;

  const target = at + delta;
  if (target >= 0 && target < list.length) return list[target];

  if (state.repeat === 'all') {
    return delta === 1 ? list[0] : list[list.length - 1];
  }
  return null;
}

export function nextIndex(state: QueueState): number | null {
  return step(state, 1);
}

export function prevIndex(state: QueueState): number | null {
  return step(state, -1);
}

/**
 * Перестановка для shuffle.
 *
 * Генератор детерминированный: тот же seed даёт тот же порядок, и очередь
 * переживает перезагрузку страницы, не перетасовавшись заново под человеком.
 * `Math.random()` этого не умеет, а хранить всю перестановку в состоянии —
 * лишние сотни чисел в localStorage и в теле каждого запроса.
 */
export function buildShuffleOrder(length: number, seed: number): number[] {
  const order = Array.from({ length: Math.max(0, length) }, (_, i) => i);

  // xorshift32 застревает в нуле навсегда, поэтому нулевой seed подменяем.
  let state = seed >>> 0 || 1;
  const random = () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x1_0000_0000;
  };

  for (let i = order.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}
