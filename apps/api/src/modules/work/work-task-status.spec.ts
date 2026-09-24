import {
  closesTask,
  isFinishedColumn,
  isStatusColumn,
  resolveTaskStatusMark,
} from './work-task-status';

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

describe('isFinishedColumn — колонка сделанной работы (VED-406)', () => {
  it('«Выполнено» и «Готово» с флагом — сделанное', () => {
    expect(isFinishedColumn({ name: 'Выполнено', isDone: true })).toBe(true);
    expect(isFinishedColumn({ name: 'Готово', isDone: true })).toBe(true);
  });

  it('тематическая колонка с флагом — не сделанное', () => {
    // Так на доске портала отмечены «РАЗНОЕ.», «МУЗЫКА», «ОБРАЗОВАНИЕ».
    expect(isFinishedColumn({ name: 'РАЗНОЕ.', isDone: true })).toBe(false);
    expect(isFinishedColumn({ name: 'МУЗЫКА', isDone: true })).toBe(false);
  });

  it('«Готово» без флага задачу не закрывает — и сделанным не считается', () => {
    expect(isFinishedColumn({ name: 'Готово', isDone: false })).toBe(false);
  });
});

describe('closesTask — въезд закрывает задачу для двигавшего (VED-406)', () => {
  it('флаг «завершающая» закрывает', () => {
    expect(closesTask({ name: 'РАЗНОЕ.', isDone: true })).toBe(true);
  });

  it('имя сделанного закрывает и без флага', () => {
    expect(closesTask({ name: 'Выполнено', isDone: false })).toBe(true);
  });

  it('рабочие колонки не закрывают', () => {
    expect(closesTask({ name: 'Тестерование', isDone: false })).toBe(false);
    expect(closesTask({ name: 'На доработку', isDone: false })).toBe(false);
  });
});

describe('isStatusColumn — раздел или статус (VED-430)', () => {
  it('«РАБОТА» — раздел сервиса, а не статус «В работе»', () => {
    expect(resolveTaskStatusMark('РАБОТА')).toBeNull();
    expect(isStatusColumn('РАБОТА')).toBe(false);
    expect(isStatusColumn('В работе')).toBe(true);
  });

  it('четыре статуса — колонки статуса, остальное — разделы', () => {
    expect(isStatusColumn('Тестерование')).toBe(true);
    expect(isStatusColumn('Выполнено')).toBe(true);
    expect(isStatusColumn('На доработку')).toBe(true);
    expect(isStatusColumn('МУЗЫКА')).toBe(false);
    expect(isStatusColumn('ПАУЗА')).toBe(false);
    expect(isStatusColumn(null)).toBe(false);
  });
});
