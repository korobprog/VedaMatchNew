import { burstRays, deckReducer, deckView, initialDeckState, swipeResultMessage, type DeckState } from './deck-state';
import { unionRecommendation } from './union-fixtures';

const items = ['a', 'b', 'c', 'd'].map((id) => unionRecommendation({ id, name: id.toUpperCase() }));
const ids = (list: { user: { id: string } }[]) => list.map((item) => item.user.id);

function run(state: DeckState, ...actions: Parameters<typeof deckReducer>[2][]): DeckState {
  return actions.reduce((acc, action) => deckReducer(items, acc, action), state);
}

describe('колода', () => {
  it('открывается с анкеты, по которой нажали, и зажимает чужую позицию', () => {
    expect(deckView(items, initialDeckState(items, 2)).current?.user.id).toBe('c');
    expect(initialDeckState(items, 99).cursor).toBe(3);
    expect(initialDeckState(items, -5).cursor).toBe(0);
    expect(initialDeckState([], 3).cursor).toBe(0);
  });

  it('решение убирает текущую, на её место встаёт следующая — одно нажатие съедает одного', () => {
    const state = run(initialDeckState(items), { type: 'decide' });
    const view = deckView(items, state);
    expect(view.current?.user.id).toBe('b');
    expect(ids(view.visible)).toEqual(['b', 'c', 'd']);
  });

  it('решённый не возвращается, даже если выдача принесла его снова', () => {
    const state = run(initialDeckState(items), { type: 'decide' });
    const reloaded = [items[0], ...items.slice(1)];
    expect(ids(deckView(reloaded, state).visible)).not.toContain('a');
  });

  it('листание двигает только указатель и не выходит за края', () => {
    let state = run(initialDeckState(items), { type: 'browse', delta: 1 }, { type: 'browse', delta: 1 });
    expect(deckView(items, state).current?.user.id).toBe('c');
    expect(state.decided).toEqual([]);
    state = run(initialDeckState(items), { type: 'browse', delta: -1 });
    expect(state.cursor).toBe(0);
  });

  it('решение по последней пролистанной не объявляет «круг пройден» при живых позади', () => {
    const state = run(initialDeckState(items, 3), { type: 'decide' });
    expect(deckView(items, state).current?.user.id).toBe('c');
  });

  it('когда решены все — текущей нет', () => {
    const state = run(initialDeckState(items), { type: 'decide' }, { type: 'decide' }, { type: 'decide' }, { type: 'decide' });
    expect(deckView(items, state).current).toBeUndefined();
    expect(deckView(items, state).position).toBe(0);
  });

  it('возврат ставит анкету на её место и ведёт указатель к ней, а не к соседу', () => {
    const state = run(
      initialDeckState(items),
      { type: 'browse', delta: 1 },
      { type: 'browse', delta: 1 },
      { type: 'decide' },
      { type: 'undo' },
    );
    expect(state.decided).toEqual([]);
    expect(deckView(items, state).current?.user.id).toBe('c');
  });

  it('возврат без решений ничего не делает', () => {
    const start = initialDeckState(items, 1);
    expect(run(start, { type: 'undo' })).toBe(start);
  });

  it('новый круг — с начала и без решённых', () => {
    const state = run(initialDeckState(items), { type: 'decide' }, { type: 'reset' });
    expect(state).toEqual({ decided: [], cursor: 0 });
  });

  it('счётчик и стрелки знают про края', () => {
    const view = deckView(items, initialDeckState(items));
    expect(view.position).toBe(1);
    expect(view.canBrowseBack).toBe(false);
    expect(view.canBrowseForward).toBe(true);
  });
});

describe('подсказка после решения', () => {
  it('пропуск молчит, взаимность — событие', () => {
    expect(swipeResultMessage('pass', false)).toBeNull();
    expect(swipeResultMessage('like', false)).toBe('Запрос отправлен');
    expect(swipeResultMessage('superlike', false)).toBe('Суперлайк отправлен');
    expect(swipeResultMessage('like', true)).toBe('Взаимно! Чат открыт');
  });
});

describe('салют', () => {
  it('лучи по кругу, разной длины и не касаются габарита', () => {
    const rays = burstRays(12, 100);
    expect(rays).toHaveLength(12);
    const lengths = rays.map((ray) => Math.hypot(ray.dx, ray.dy));
    expect(Math.max(...lengths)).toBeLessThan(100);
    expect(new Set(lengths.map((value) => value.toFixed(2))).size).toBeGreaterThan(3);
  });

  it('без лучей или радиуса — пусто', () => {
    expect(burstRays(0, 100)).toEqual([]);
    expect(burstRays(8, 0)).toEqual([]);
  });
});
