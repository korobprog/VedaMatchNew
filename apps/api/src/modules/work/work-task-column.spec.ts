import { newTaskColumnQuery } from './work-task-column';

describe('newTaskColumnQuery', () => {
  it('указанную колонку ищет по id и только на этой доске', () => {
    expect(newTaskColumnQuery('board-1', 'col-3').where).toEqual({
      id: 'col-3',
      boardId: 'board-1',
    });
  });

  it('без колонки берёт первую по порядку, а не какую попало', () => {
    // VED-73: `id: undefined` Prisma отбрасывала, и без сортировки задача
    // уезжала в случайную колонку.
    for (const missing of [undefined, null, '', '   ', 42]) {
      const query = newTaskColumnQuery('board-1', missing);
      expect(query.where).toEqual({ boardId: 'board-1' });
      expect(query.where).not.toHaveProperty('id');
    }
    expect(newTaskColumnQuery('board-1', undefined).orderBy).toEqual({
      position: 'asc',
    });
  });

  it('обрезает пробелы вокруг идентификатора', () => {
    expect(newTaskColumnQuery('board-1', ' col-3 ').where).toMatchObject({
      id: 'col-3',
    });
  });
});
