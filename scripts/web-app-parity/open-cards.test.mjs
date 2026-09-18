import assert from 'node:assert/strict';
import { test } from 'node:test';
import { openCardsAcrossBoard } from './open-cards.mjs';

test('карточка в колонке создания (VedaMath-Native) видна', () => {
  const board = {
    columns: [
      {
        id: 'col-native',
        isDone: false,
        tasks: [{ id: 't1', title: 'ДОГНАТЬ. Рынок: …' }],
      },
    ],
  };
  assert.deepEqual(openCardsAcrossBoard(board), [{ id: 't1', title: 'ДОГНАТЬ. Рынок: …' }]);
});

// Раунд 001, Н4: карточку подвинули руками в рабочую колонку, отличную от
// колонки создания — дедуп обязан её видеть, иначе следующий PR по тому же
// сервису заведёт вторую.
test('карточка в другой открытой колонке («В работе») тоже видна', () => {
  const board = {
    columns: [
      { id: 'col-native', isDone: false, tasks: [] },
      {
        id: 'col-in-progress',
        isDone: false,
        tasks: [{ id: 't2', title: 'ДОГНАТЬ. Общение: …' }],
      },
    ],
  };
  assert.deepEqual(openCardsAcrossBoard(board), [{ id: 't2', title: 'ДОГНАТЬ. Общение: …' }]);
});

// Закрытая карточка — не дубль, а прошлая задача: новый PR должен завести
// новую, а не найти и прокомментировать закрытую.
test('карточка в закрытой колонке (isDone) не видна', () => {
  const board = {
    columns: [
      {
        id: 'col-done',
        isDone: true,
        tasks: [{ id: 't3', title: 'ДОГНАТЬ. Музыка: закрытая старая' }],
      },
    ],
  };
  assert.deepEqual(openCardsAcrossBoard(board), []);
});

test('карточки из нескольких открытых колонок собираются вместе, закрытая колонка выпадает', () => {
  const board = {
    columns: [
      { id: 'col-native', isDone: false, tasks: [{ id: 't1', title: 'A' }] },
      { id: 'col-in-progress', isDone: false, tasks: [{ id: 't2', title: 'B' }] },
      { id: 'col-done', isDone: true, tasks: [{ id: 't3', title: 'C' }] },
      { id: 'col-review', isDone: false, tasks: [{ id: 't4', title: 'D' }] },
    ],
  };
  assert.deepEqual(
    openCardsAcrossBoard(board).map((task) => task.id),
    ['t1', 't2', 't4'],
  );
});

test('колонка без tasks — не бросает исключение', () => {
  const board = { columns: [{ id: 'col-empty', isDone: false }] };
  assert.deepEqual(openCardsAcrossBoard(board), []);
});

test('доска без колонок, null, undefined — пустой список, не исключение', () => {
  assert.deepEqual(openCardsAcrossBoard({ columns: [] }), []);
  assert.deepEqual(openCardsAcrossBoard(null), []);
  assert.deepEqual(openCardsAcrossBoard(undefined), []);
  assert.deepEqual(openCardsAcrossBoard({}), []);
});
