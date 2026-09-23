import {
  WORK_NOTICE_DELAY_MS,
  resolveNotifyAt,
  resolveWorkNotice,
  type WorkNoticeColumn,
  type WorkNoticeWindow,
} from './work-notice';

const todo: WorkNoticeColumn = { id: 'c1', name: 'Надо', isDone: false };
const testing: WorkNoticeColumn = {
  id: 'c2',
  name: 'Тестирование',
  isDone: false,
};
const done: WorkNoticeColumn = { id: 'c3', name: 'Готово', isDone: true };

/** Окно без комментария — обычный переезд, как было до VED-298. */
function moved(
  from: WorkNoticeColumn | null,
  to: WorkNoticeColumn,
  comment: Partial<
    Pick<WorkNoticeWindow, 'commentExcerpt' | 'commentCount'>
  > = {},
): WorkNoticeWindow {
  return {
    from,
    to,
    commentExcerpt: comment.commentExcerpt ?? null,
    commentCount: comment.commentCount ?? 0,
  };
}

describe('resolveWorkNotice — только перенос', () => {
  it('передумал и вернул на место — не уведомляем', () => {
    expect(resolveWorkNotice(moved(todo, todo))).toEqual({ kind: 'skip' });
  });

  it('обычный переезд — событие о смене колонки', () => {
    expect(resolveWorkNotice(moved(todo, testing))).toEqual({
      kind: 'status',
      fromColumnName: 'Надо',
      toColumnName: 'Тестирование',
      commentExcerpt: null,
      commentCount: 0,
    });
  });

  it('выезд из «готово» — возврат на доработку', () => {
    expect(resolveWorkNotice(moved(done, testing))).toEqual({
      kind: 'returned',
      columnName: 'Тестирование',
      commentExcerpt: null,
      commentCount: 0,
    });
  });

  it('въезд в «готово» — обычная смена колонки, а не возврат', () => {
    expect(resolveWorkNotice(moved(testing, done))).toMatchObject({
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
    expect(resolveWorkNotice(moved(done, archive))).toMatchObject({
      kind: 'status',
      fromColumnName: 'Готово',
      toColumnName: 'Сдано',
    });
  });

  it('выезд из тематической колонки с флагом «завершающая» — не возврат (VED-406)', () => {
    // «РАЗНОЕ.» на доске портала отмечена завершающей, новые карточки
    // заказчик заводит в ней. Агент берёт карточку в тест — это смена
    // статуса, а не «Задачу вернули».
    const misc: WorkNoticeColumn = { id: 'c5', name: 'РАЗНОЕ.', isDone: true };
    expect(resolveWorkNotice(moved(misc, testing))).toMatchObject({
      kind: 'status',
      fromColumnName: 'РАЗНОЕ.',
      toColumnName: 'Тестирование',
    });
  });

  it('выезд из «Выполнено» — возврат, как и из «Готово»', () => {
    const accepted: WorkNoticeColumn = {
      id: 'c6',
      name: 'Выполнено',
      isDone: true,
    };
    expect(resolveWorkNotice(moved(accepted, todo))).toMatchObject({
      kind: 'returned',
      columnName: 'Надо',
    });
  });

  it('несколько переносов подряд — одна новость с итоговой колонкой', () => {
    // Очередь хранит колонку первого движения, «куда» читается на отправке:
    // промежуточные остановки в новость не попадают вовсе.
    expect(resolveWorkNotice(moved(todo, done))).toMatchObject({
      kind: 'status',
      fromColumnName: 'Надо',
      toColumnName: 'Готово',
    });
  });
});

describe('resolveWorkNotice — только комментарий', () => {
  it('комментарий без переноса уведомление шлёт', () => {
    // Через комментарии карточек идёт переписка с заказчиком: выключи их — и
    // вопрос к человеку до него не дойдёт. Убирали дубли, а не слух.
    expect(
      resolveWorkNotice(
        moved(null, testing, { commentExcerpt: 'Готово?', commentCount: 1 }),
      ),
    ).toEqual({
      kind: 'commented',
      commentExcerpt: 'Готово?',
      commentCount: 1,
    });
  });

  it('несколько реплик за окно — одно уведомление со счётчиком', () => {
    expect(
      resolveWorkNotice(
        moved(null, testing, { commentExcerpt: 'Третья', commentCount: 3 }),
      ),
    ).toEqual({
      kind: 'commented',
      commentExcerpt: 'Третья',
      commentCount: 3,
    });
  });

  it('карточка вернулась на место, но человек высказался — новость есть', () => {
    expect(
      resolveWorkNotice(
        moved(todo, todo, {
          commentExcerpt: 'Не туда положил',
          commentCount: 1,
        }),
      ),
    ).toMatchObject({ kind: 'commented', commentExcerpt: 'Не туда положил' });
  });

  it('колонку снесли вместе с доской — от окна остаётся комментарий', () => {
    expect(
      resolveWorkNotice(
        moved(null, testing, { commentExcerpt: 'Вопрос', commentCount: 1 }),
      ),
    ).toMatchObject({ kind: 'commented' });
  });

  it('пустой текст комментарием не считается', () => {
    expect(
      resolveWorkNotice(
        moved(null, testing, { commentExcerpt: '   ', commentCount: 1 }),
      ),
    ).toEqual({ kind: 'skip' });
  });
});

describe('resolveWorkNotice — комментарий вместе с переносом', () => {
  it('прокомментировал и тут же перенёс — одно уведомление, побеждает перенос', () => {
    // Жалоба заказчика в VED-298 ровно про этот жест: два уведомления об
    // одном действии. Текст комментария не теряется, он едет с переездом.
    expect(
      resolveWorkNotice(
        moved(todo, testing, { commentExcerpt: 'Проверьте', commentCount: 1 }),
      ),
    ).toEqual({
      kind: 'status',
      fromColumnName: 'Надо',
      toColumnName: 'Тестирование',
      commentExcerpt: 'Проверьте',
      commentCount: 1,
    });
  });

  it('вернул из «готово» со словами — возврат несёт причину', () => {
    expect(
      resolveWorkNotice(
        moved(done, testing, {
          commentExcerpt: 'Не открывается на телефоне',
          commentCount: 1,
        }),
      ),
    ).toEqual({
      kind: 'returned',
      columnName: 'Тестирование',
      commentExcerpt: 'Не открывается на телефоне',
      commentCount: 1,
    });
  });

  it('счётчик без текста ничего не приписывает переезду', () => {
    // Строка из прежней очереди: текста в ней нет, счётчик по умолчанию ноль.
    expect(
      resolveWorkNotice(
        moved(todo, testing, { commentExcerpt: null, commentCount: 4 }),
      ),
    ).toMatchObject({ commentExcerpt: null, commentCount: 0 });
  });

  it('текст без счётчика считается одной репликой', () => {
    expect(
      resolveWorkNotice(
        moved(todo, testing, { commentExcerpt: 'Слово', commentCount: 0 }),
      ),
    ).toMatchObject({ commentExcerpt: 'Слово', commentCount: 1 });
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

  it('окно склейки и окно «ой, не туда» — одно и то же', () => {
    // Склеить можно только то, что ещё не ушло: граница у них общая.
    expect(WORK_NOTICE_DELAY_MS).toBe(3 * 60_000);
  });
});
