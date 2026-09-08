import {
  WORK_NOTICE_DELAY_MS,
  resolveNotifyAt,
  resolveWorkNotice,
  type WorkNoticeColumn,
} from './work-notice';

const todo: WorkNoticeColumn = { id: 'c1', name: 'Надо', isDone: false };
const testing: WorkNoticeColumn = {
  id: 'c2',
  name: 'Тестирование',
  isDone: false,
};
const done: WorkNoticeColumn = { id: 'c3', name: 'Готово', isDone: true };

describe('resolveWorkNotice', () => {
  it('передумал и вернул на место — не уведомляем', () => {
    expect(resolveWorkNotice(todo, todo)).toEqual({ kind: 'skip' });
  });

  it('обычный переезд — событие о смене колонки', () => {
    expect(resolveWorkNotice(todo, testing)).toEqual({
      kind: 'status',
      fromColumnName: 'Надо',
      toColumnName: 'Тестирование',
    });
  });

  it('выезд из «готово» — возврат на доработку', () => {
    expect(resolveWorkNotice(done, testing)).toEqual({
      kind: 'returned',
      columnName: 'Тестирование',
    });
  });

  it('въезд в «готово» — обычная смена колонки, а не возврат', () => {
    expect(resolveWorkNotice(testing, done)).toEqual({
      kind: 'status',
      fromColumnName: 'Тестирование',
      toColumnName: 'Готово',
    });
  });

  it('переезд между двумя закрывающими колонками не считается возвратом', () => {
    const archive: WorkNoticeColumn = {
      id: 'c4',
      name: 'Сдано',
      isDone: true,
    };
    expect(resolveWorkNotice(done, archive)).toEqual({
      kind: 'status',
      fromColumnName: 'Готово',
      toColumnName: 'Сдано',
    });
  });
});

describe('resolveNotifyAt', () => {
  const now = new Date('2026-09-08T12:00:00.000Z');

  it('первое движение — окно от текущего момента', () => {
    expect(resolveNotifyAt(null, now)).toEqual(
      new Date(now.getTime() + WORK_NOTICE_DELAY_MS),
    );
  });

  it('повторное движение не отодвигает отправку', () => {
    const planned = new Date(now.getTime() + 30_000);
    expect(resolveNotifyAt(planned, now)).toBe(planned);
  });
});
