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
  archivedAt?: Date | null;
  member?: boolean;
}) {
  const emit = jest.fn();
  const deleted: string[] = [];
  const prisma = {
    workTaskNotice: {
      updateMany: jest.fn(() => Promise.resolve({ count: 1 })),
      findMany: jest.fn(() => Promise.resolve([{ id: 'notice-1' }])),
      findUnique: jest.fn(() =>
        Promise.resolve({
          recipientId: 'recipient',
          fromColumnId: options.fromColumn?.id ?? 'col-gone',
          actor: { name: 'Гопал', spiritualName: null },
          task: {
            id: 'task-1',
            number: 5,
            title: 'Починить колокольчик',
            spaceId: 'space-1',
            columnId: options.column.id,
            archivedAt: options.archivedAt ?? null,
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
