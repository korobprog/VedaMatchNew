import {
  TASK_SEARCH_MAX_WORDS,
  taskNumberOf,
  taskSearchWhere,
  taskSearchWords,
} from './work-task-search';

describe('taskSearchWords', () => {
  it('splits the query into lowercase words without repeats', () => {
    expect(taskSearchWords('  Отчёт  март, отчёт ')).toEqual(['отчёт', 'март']);
  });

  it('drops quotes around a word', () => {
    expect(taskSearchWords('«афоризм» "шастры"')).toEqual([
      'афоризм',
      'шастры',
    ]);
  });

  it('treats anything but a string as an empty query', () => {
    expect(taskSearchWords(undefined)).toEqual([]);
    expect(taskSearchWords(['a'])).toEqual([]);
    expect(taskSearchWords('   ')).toEqual([]);
  });

  it('keeps no more than the word limit', () => {
    const many = Array.from({ length: 20 }, (_, i) => `w${i}`).join(' ');
    expect(taskSearchWords(many)).toHaveLength(TASK_SEARCH_MAX_WORDS);
  });
});

describe('taskNumberOf', () => {
  it.each([
    ['ved-76', 76],
    ['ved76', 76],
    ['#76', 76],
    ['76', 76],
    ['VED-7', 7],
  ])('reads %s as the task number', (word, number) => {
    expect(taskNumberOf(word, 'VED')).toBe(number);
  });

  // «MKT-5» на доске VED — чужая задача, а не VED-5.
  it('ignores a number with a foreign prefix', () => {
    expect(taskNumberOf('mkt-5', 'VED')).toBeNull();
  });

  it('is not fooled by a word that merely contains digits', () => {
    expect(taskNumberOf('v2ray', 'VED')).toBeNull();
    expect(taskNumberOf('2026-09-10', 'VED')).toBeNull();
  });
});

describe('taskSearchWhere', () => {
  it('asks every word to be found somewhere in the task', () => {
    const where = taskSearchWhere('b1', ['отчёт', 'март'], 'VED');
    expect(where).toMatchObject({ boardId: 'b1', archivedAt: null });
    expect(where.AND).toHaveLength(2);
    const [first] = where.AND as Array<{ OR: object[] }>;
    const contains = { contains: 'отчёт', mode: 'insensitive' };
    expect(first.OR).toEqual([
      { title: contains },
      { description: contains },
      { labels: { some: { label: { name: contains } } } },
      { checklist: { some: { text: contains } } },
      { comments: { some: { body: contains } } },
      { assignee: { name: contains } },
      { assignee: { spiritualName: contains } },
    ]);
  });

  it('also matches the task number when the word is one', () => {
    const where = taskSearchWhere('b1', ['ved-76'], 'VED');
    const [first] = where.AND as Array<{ OR: object[] }>;
    expect(first.OR).toContainEqual({ number: 76 });
  });
});
