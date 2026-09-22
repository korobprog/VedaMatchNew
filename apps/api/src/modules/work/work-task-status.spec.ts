import { resolveTaskStatusMark } from './work-task-status';

describe('resolveTaskStatusMark', () => {
  it('узнаёт четыре состояния из карточки VED-272', () => {
    expect(resolveTaskStatusMark('В работе')).toBe('in_progress');
    expect(resolveTaskStatusMark('Тестирование')).toBe('testing');
    expect(resolveTaskStatusMark('Выполнено')).toBe('done');
    expect(resolveTaskStatusMark('На доработку')).toBe('rework');
  });

  it('узнаёт колонку «Тестерование», как она названа на доске', () => {
    // Через «е»: так колонка называется у заказчика, и без этого написания
    // самый частый переход в тестирование оставался без значка (VED-312).
    expect(resolveTaskStatusMark('Тестерование')).toBe('testing');
    expect(resolveTaskStatusMark('  тестерование ')).toBe('testing');
  });

  it('не спотыкается о регистр, пробелы, кавычки и ё', () => {
    expect(resolveTaskStatusMark('  выполнено  ')).toBe('done');
    expect(resolveTaskStatusMark('«На доработку»')).toBe('rework');
    expect(resolveTaskStatusMark('НА ДОРАБОТКУ'.replace(' ', ' '))).toBe(
      'rework',
    );
    expect(resolveTaskStatusMark('Завершено')).toBe('done');
  });

  it('незнакомую колонку оставляет без значка', () => {
    // Своя доска называет колонки по-своему: подписать «Бэклог» одним из
    // четырёх наших слов было бы хуже, чем не подписать вовсе.
    expect(resolveTaskStatusMark('Бэклог')).toBeNull();
    expect(resolveTaskStatusMark('Идеи на потом')).toBeNull();
    expect(resolveTaskStatusMark('')).toBeNull();
    expect(resolveTaskStatusMark(null)).toBeNull();
    expect(resolveTaskStatusMark(undefined)).toBeNull();
  });

  it('не подписывает колонку, которая лишь содержит знакомое слово', () => {
    // «Выполнено в прошлом квартале» — другая колонка, а не «Выполнено».
    expect(resolveTaskStatusMark('Выполнено в прошлом квартале')).toBeNull();
  });
});
