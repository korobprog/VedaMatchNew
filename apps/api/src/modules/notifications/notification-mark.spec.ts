import { parseNotificationMark, resolveColumnMark } from './notification-mark';

describe('resolveColumnMark', () => {
  it('узнаёт четыре состояния из карточки VED-272', () => {
    expect(resolveColumnMark('В работе')).toBe('in_progress');
    expect(resolveColumnMark('Тестирование')).toBe('testing');
    expect(resolveColumnMark('Выполнено')).toBe('done');
    expect(resolveColumnMark('На доработку')).toBe('rework');
  });

  it('не спотыкается о регистр, пробелы, кавычки и ё', () => {
    expect(resolveColumnMark('  выполнено  ')).toBe('done');
    expect(resolveColumnMark('«На доработку»')).toBe('rework');
    expect(resolveColumnMark('НА ДОРАБОТКУ'.replace(' ', ' '))).toBe('rework');
    expect(resolveColumnMark('Завершено')).toBe('done');
  });

  it('незнакомую колонку оставляет без значка', () => {
    // Своя доска называет колонки по-своему: подписать «Бэклог» одним из
    // четырёх наших слов было бы хуже, чем не подписать вовсе.
    expect(resolveColumnMark('Бэклог')).toBeNull();
    expect(resolveColumnMark('Идеи на потом')).toBeNull();
    expect(resolveColumnMark('')).toBeNull();
    expect(resolveColumnMark(null)).toBeNull();
    expect(resolveColumnMark(undefined)).toBeNull();
  });

  it('не подписывает колонку, которая лишь содержит знакомое слово', () => {
    // «Выполнено в прошлом квартале» — другая колонка, а не «Выполнено».
    expect(resolveColumnMark('Выполнено в прошлом квартале')).toBeNull();
  });
});

describe('parseNotificationMark', () => {
  it('принимает известные коды', () => {
    expect(parseNotificationMark('done')).toBe('done');
    expect(parseNotificationMark('in_progress')).toBe('in_progress');
  });

  it('старую или чужую строку из базы гасит в null', () => {
    expect(parseNotificationMark('backlog')).toBeNull();
    expect(parseNotificationMark(null)).toBeNull();
    expect(parseNotificationMark(undefined)).toBeNull();
  });
});
