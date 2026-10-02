import { WorkNoticeWorkerService } from './work-notice-worker.service';
import type { PrismaService } from '../../prisma/prisma.service';
import type { EventEmitter2 } from '@nestjs/event-emitter';
import type { ConfigService } from '@nestjs/config';

const todo = { id: 'col-todo', name: 'Надо', isDone: false };
const testing = { id: 'col-test', name: 'Тестирование', isDone: false };
const done = { id: 'col-done', name: 'Готово', isDone: true };

type Column = typeof todo;

/**
 * Воркер с подменённой базой: Redis не поднимается (REDIS_HOST пуст), тик
 * вызывается руками. Проверяется решение об отправке, а не лиз.
 */
function createWorker(options: {
  /** Колонка, где карточка оказалась к моменту отправки. */
  column: Column;
  /** Колонка, откуда уехали — записана в очереди. */
  fromColumn: Column | null;
  /** `true` — движения в окне не было вовсе, строку завёл комментарий. */
  withoutMove?: boolean;
  commentBody?: string | null;
  commentCount?: number;
  archivedAt?: Date | null;
  member?: boolean;
  /** Кому адресована строка; по умолчанию он же и исполнитель задачи. */
  recipientId?: string;
  /** Исполнитель задачи на момент отправки. */
  assigneeId?: string | null;
  createdById?: string | null;
  /** Кто ставил строку в очередь; по умолчанию — обычный участник. */
  actorId?: string | null;
  actorIsAgent?: boolean;
  /** В окне этой строки актор действовал от имени получателя. */
  actedForRecipient?: boolean;
}) {
  const emit = jest.fn();
  const deleted: string[] = [];
  const recipientId = options.recipientId ?? 'recipient';
  const prisma = {
    workTaskNotice: {
      updateMany: jest.fn(() => Promise.resolve({ count: 1 })),
      findMany: jest.fn(() => Promise.resolve([{ id: 'notice-1' }])),
      findUnique: jest.fn(() =>
        Promise.resolve({
          id: 'notice-1',
          recipientId,
          actorId: options.actorId === undefined ? 'actor' : options.actorId,
          createdAt: new Date('2026-09-22T10:00:00.000Z'),
          notifyAt: new Date('2026-09-22T10:03:00.000Z'),
          fromColumnId: options.withoutMove
            ? null
            : (options.fromColumn?.id ?? 'col-gone'),
          commentBody: options.commentBody ?? null,
          commentCount: options.commentCount ?? 0,
          actor: {
            name: 'Гопал',
            spiritualName: null,
            isAgent: options.actorIsAgent ?? false,
          },
          task: {
            id: 'task-1',
            number: 5,
            title: 'Починить колокольчик',
            spaceId: 'space-1',
            columnId: options.column.id,
            archivedAt: options.archivedAt ?? null,
            assigneeId:
              options.assigneeId === undefined
                ? recipientId
                : options.assigneeId,
            createdById:
              options.createdById === undefined
                ? 'author'
                : options.createdById,
            space: { prefix: 'VED' },
            column: options.column,
          },
        }),
      ),
      delete: jest.fn(({ where }: { where: { id: string } }) => {
        deleted.push(where.id);
        return Promise.resolve({});
      }),
    },
    workColumn: {
      findUnique: jest.fn(() => Promise.resolve(options.fromColumn)),
    },
    workSpaceMember: {
      findFirst: jest.fn(() =>
        Promise.resolve((options.member ?? true) ? { id: 'member-1' } : null),
      ),
    },
    workActivity: {
      findFirst: jest.fn(() =>
        Promise.resolve(
          options.actedForRecipient ? { id: 'activity-1' } : null,
        ),
      ),
    },
  } as unknown as PrismaService;

  const worker = new WorkNoticeWorkerService(
    prisma,
    { emit } as unknown as EventEmitter2,
    { get: () => undefined } as unknown as ConfigService,
  );
  return { worker, emit, deleted };
}

describe('WorkNoticeWorkerService.tick', () => {
  it('карточка вернулась на место — уведомления нет, запись убрана', async () => {
    const { worker, emit, deleted } = createWorker({
      column: todo,
      fromColumn: todo,
    });
    await worker.tick();
    expect(emit).not.toHaveBeenCalled();
    expect(deleted).toEqual(['notice-1']);
  });

  it('карточка осталась в новой колонке — уведомление о смене', async () => {
    const { worker, emit } = createWorker({
      column: testing,
      fromColumn: todo,
    });
    await worker.tick();
    expect(emit).toHaveBeenCalledWith(
      'work.task.status-changed',
      expect.objectContaining({
        recipientId: 'recipient',
        taskKey: 'VED-5',
        fromColumnName: 'Надо',
        toColumnName: 'Тестирование',
        actorName: 'Гопал',
      }),
    );
  });

  it('выезд из «готово» — событие возврата, а не смены колонки', async () => {
    const { worker, emit } = createWorker({
      column: testing,
      fromColumn: done,
    });
    await worker.tick();
    expect(emit).toHaveBeenCalledWith(
      'work.task.returned',
      expect.objectContaining({ columnName: 'Тестирование' }),
    );
  });

  it('задачу успели убрать в архив — новость протухла', async () => {
    const { worker, emit, deleted } = createWorker({
      column: testing,
      fromColumn: todo,
      archivedAt: new Date(),
    });
    await worker.tick();
    expect(emit).not.toHaveBeenCalled();
    expect(deleted).toEqual(['notice-1']);
  });

  it('получателя исключили из среды — название задачи ему не уходит', async () => {
    const { worker, emit } = createWorker({
      column: testing,
      fromColumn: todo,
      member: false,
    });
    await worker.tick();
    expect(emit).not.toHaveBeenCalled();
  });

  it('колонку снесли вместе с доской — сказать «откуда» нечего', async () => {
    const { worker, emit, deleted } = createWorker({
      column: testing,
      fromColumn: null,
    });
    await worker.tick();
    expect(emit).not.toHaveBeenCalled();
    expect(deleted).toEqual(['notice-1']);
  });

  it('комментарий без переноса — уведомление о комментарии', async () => {
    const { worker, emit } = createWorker({
      column: testing,
      fromColumn: null,
      withoutMove: true,
      commentBody: 'Когда посмотрите?',
      commentCount: 1,
    });
    await worker.tick();
    expect(emit).toHaveBeenCalledWith(
      'work.task.commented',
      expect.objectContaining({
        recipientId: 'recipient',
        taskKey: 'VED-5',
        excerpt: 'Когда посмотрите?',
        commentCount: 1,
        columnName: 'Тестирование',
      }),
    );
  });

  it('прокомментировал и перенёс — одно событие о смене с текстом реплики', async () => {
    const { worker, emit } = createWorker({
      column: testing,
      fromColumn: todo,
      commentBody: 'Проверьте, пожалуйста',
      commentCount: 1,
    });
    await worker.tick();
    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledWith(
      'work.task.status-changed',
      expect.objectContaining({
        toColumnName: 'Тестирование',
        commentExcerpt: 'Проверьте, пожалуйста',
        commentCount: 1,
      }),
    );
  });

  it('вернул из «готово» со словами — причина едет с возвратом', async () => {
    const { worker, emit } = createWorker({
      column: testing,
      fromColumn: done,
      commentBody: 'Не открывается на телефоне',
      commentCount: 2,
    });
    await worker.tick();
    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledWith(
      'work.task.returned',
      expect.objectContaining({
        columnName: 'Тестирование',
        commentExcerpt: 'Не открывается на телефоне',
        commentCount: 2,
      }),
    );
  });

  it('перенёс туда и обратно, но высказался — остаётся комментарий', async () => {
    const { worker, emit } = createWorker({
      column: todo,
      fromColumn: todo,
      commentBody: 'Ошибся колонкой',
      commentCount: 1,
    });
    await worker.tick();
    expect(emit).toHaveBeenCalledWith(
      'work.task.commented',
      expect.objectContaining({ excerpt: 'Ошибся колонкой' }),
    );
  });

  it('запись занял другой инстанс — молча уступаем', async () => {
    const { worker, emit } = createWorker({
      column: testing,
      fromColumn: todo,
    });
    (
      worker as unknown as {
        prisma: { workTaskNotice: { updateMany: jest.Mock } };
      }
    ).prisma.workTaskNotice.updateMany.mockResolvedValue({ count: 0 });
    await worker.tick();
    expect(emit).not.toHaveBeenCalled();
  });
});

describe('WorkNoticeWorkerService — строка протухла (VED-507)', () => {
  it('пока дозревало, задачу поручили другому — прежнему исполнителю не шлём', async () => {
    // Строка адресована тому, кто был исполнителем в момент постановки; к
    // отправке ход уже на другом, и новость ему не положена.
    const { worker, emit, deleted } = createWorker({
      column: testing,
      fromColumn: todo,
      recipientId: 'stas',
      assigneeId: 'sevak',
      createdById: 'mamu',
    });
    await worker.tick();
    expect(emit).not.toHaveBeenCalled();
    expect(deleted).toEqual(['notice-1']);
  });

  it('получатель остался автором, но исполнителем стал другой — тоже не шлём', async () => {
    const { worker, emit } = createWorker({
      column: testing,
      fromColumn: todo,
      recipientId: 'mamu',
      assigneeId: 'sevak',
      createdById: 'mamu',
    });
    await worker.tick();
    expect(emit).not.toHaveBeenCalled();
  });

  it('у задачы нет ни исполнителя, ни автора — некому писать', async () => {
    const { worker, emit } = createWorker({
      column: testing,
      fromColumn: todo,
      assigneeId: null,
      createdById: null,
    });
    await worker.tick();
    expect(emit).not.toHaveBeenCalled();
  });

  it('строка адресована самому действовавшему — не шлём', async () => {
    const { worker, emit } = createWorker({
      column: testing,
      fromColumn: todo,
      recipientId: 'stas',
      assigneeId: 'stas',
      actorId: 'stas',
    });
    await worker.tick();
    expect(emit).not.toHaveBeenCalled();
  });

  it('строку завёл агент, распоряжавшийся от имени получателя — не шлём', async () => {
    const { worker, emit, deleted } = createWorker({
      column: testing,
      fromColumn: todo,
      actorIsAgent: true,
      actedForRecipient: true,
    });
    await worker.tick();
    expect(emit).not.toHaveBeenCalled();
    expect(deleted).toEqual(['notice-1']);
  });

  it('агент работал сам, без человека — обычное уведомление уходит', async () => {
    const { worker, emit } = createWorker({
      column: testing,
      fromColumn: todo,
      actorIsAgent: true,
      actedForRecipient: false,
    });
    await worker.tick();
    expect(emit).toHaveBeenCalledWith(
      'work.task.status-changed',
      expect.objectContaining({ recipientId: 'recipient' }),
    );
  });

  it('обычный участник — историю от его имени не дочитываем', async () => {
    const { worker, emit } = createWorker({
      column: testing,
      fromColumn: todo,
    });
    await worker.tick();
    expect(
      (
        worker as unknown as {
          prisma: { workActivity: { findFirst: jest.Mock } };
        }
      ).prisma.workActivity.findFirst,
    ).not.toHaveBeenCalled();
    expect(emit).toHaveBeenCalledTimes(1);
  });
});
