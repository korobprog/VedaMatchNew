import { WorkNoticesService } from './work-notices.service';
import type { PrismaService } from '../../prisma/prisma.service';
import { WORK_NOTICE_DELAY_MS } from './work-notice';

type Row = {
  taskId: string;
  recipientId: string;
  actorId: string;
  fromColumnId: string | null;
  commentBody: string | null;
  commentCount: number;
  notifyAt: Date;
  claimedAt: Date | null;
};

type Key = { taskId: string; recipientId: string; actorId: string };

/**
 * Очередь в памяти с тем же ключом, что и у таблицы: тройка «задача +
 * получатель + кто действовал». Проверяется именно склейка — что во что
 * сливается и что остаётся отдельной строкой.
 */
function createStore() {
  const rows = new Map<string, Row>();
  const id = (key: Key) => `${key.taskId}|${key.recipientId}|${key.actorId}`;

  const prisma = {
    workTaskNotice: {
      findUnique: ({ where }: { where: { taskId_recipientId_actorId: Key } }) =>
        Promise.resolve(rows.get(id(where.taskId_recipientId_actorId)) ?? null),
      upsert: ({
        where,
        create,
        update,
      }: {
        where: { taskId_recipientId_actorId: Key };
        create: Record<string, unknown>;
        update: Record<string, unknown>;
      }) => {
        const slot = id(where.taskId_recipientId_actorId);
        const existing = rows.get(slot);
        if (!existing) {
          rows.set(slot, {
            fromColumnId: null,
            commentBody: null,
            commentCount: 0,
            claimedAt: null,
            ...(create as Partial<Row>),
          } as Row);
          return Promise.resolve(rows.get(slot));
        }
        for (const [field, value] of Object.entries(update)) {
          if (
            value &&
            typeof value === 'object' &&
            'increment' in (value as Record<string, number>)
          ) {
            const by = (value as { increment: number }).increment;
            (existing as unknown as Record<string, number>)[field] =
              ((existing as unknown as Record<string, number>)[field] ?? 0) +
              by;
          } else {
            (existing as unknown as Record<string, unknown>)[field] = value;
          }
        }
        return Promise.resolve(existing);
      },
      deleteMany: ({
        where,
      }: {
        where: { taskId: string; recipientId: string; claimedAt: null };
      }) => {
        let count = 0;
        for (const [slot, row] of rows) {
          if (
            row.taskId === where.taskId &&
            row.recipientId === where.recipientId &&
            row.claimedAt === null
          ) {
            rows.delete(slot);
            count += 1;
          }
        }
        return Promise.resolve({ count });
      },
    },
  } as unknown as PrismaService;

  return { prisma, rows, service: new WorkNoticesService(prisma) };
}

const task = { id: 'task-1', assigneeId: 'assignee', createdById: 'author' };
const now = new Date('2026-09-22T10:00:00.000Z');
const due = new Date(now.getTime() + WORK_NOTICE_DELAY_MS);

describe('WorkNoticesService — кого касается', () => {
  it('тот, кто действовал, себе уведомления не заводит', async () => {
    const { service, rows } = createStore();
    await service.enqueueMove(task, 'assignee', 'col-todo', now);
    expect([...rows.values()].map((row) => row.recipientId)).toEqual([
      'author',
    ]);
  });

  it('человек и исполнитель, и автор — получатель один, и он же молчит о себе', async () => {
    const { service, rows } = createStore();
    const solo = { id: 'task-2', assigneeId: 'gopal', createdById: 'gopal' };
    await service.enqueueComment(solo, 'gopal', 'Сам с собой', now);
    expect(rows.size).toBe(0);
  });

  it('комментарий уведомляет обоих, кроме автора реплики', async () => {
    const { service, rows } = createStore();
    await service.enqueueComment(task, 'outsider', 'Вопрос', now);
    expect([...rows.values()].map((row) => row.recipientId).sort()).toEqual([
      'assignee',
      'author',
    ]);
  });

  it('сам поработал с задачей — своё дозревающее уведомление снимается', async () => {
    // «Зачем ему снова утыкаться в то что он сам только что исправил» —
    // строку исполнителю мог завести кто-то другой минутой раньше.
    const { service, rows } = createStore();
    await service.enqueueMove(task, 'author', 'col-todo', now);
    expect([...rows.values()].map((row) => row.recipientId)).toEqual([
      'assignee',
    ]);

    await service.enqueueComment(task, 'assignee', 'Уже чиню', now);
    expect([...rows.values()].map((row) => row.recipientId)).toEqual([
      'author',
    ]);
  });

  it('взятую воркером строку не снимаем — она уже в отправке', async () => {
    const { service, rows } = createStore();
    await service.enqueueMove(task, 'author', 'col-todo', now);
    for (const row of rows.values()) row.claimedAt = now;
    await service.enqueueComment(task, 'assignee', 'Уже чиню', now);
    expect([...rows.values()].map((row) => row.recipientId).sort()).toEqual([
      'assignee',
      'author',
    ]);
  });
});

describe('WorkNoticesService — склейка окна', () => {
  it('комментарий и перенос одного человека ложатся в одну строку', async () => {
    const { service, rows } = createStore();
    await service.enqueueComment(task, 'outsider', 'Проверьте', now);
    await service.enqueueMove(
      task,
      'outsider',
      'col-todo',
      new Date(now.getTime() + 5_000),
    );

    expect(rows.size).toBe(2); // по строке на получателя, не по действию
    const forAuthor = [...rows.values()].find(
      (r) => r.recipientId === 'author',
    );
    expect(forAuthor).toMatchObject({
      fromColumnId: 'col-todo',
      commentBody: 'Проверьте',
      commentCount: 1,
      notifyAt: due,
    });
  });

  it('перенос, потом комментарий — тот же результат', async () => {
    const { service, rows } = createStore();
    await service.enqueueMove(task, 'outsider', 'col-todo', now);
    await service.enqueueComment(
      task,
      'outsider',
      'Проверьте',
      new Date(now.getTime() + 5_000),
    );
    const forAuthor = [...rows.values()].find(
      (r) => r.recipientId === 'author',
    );
    expect(forAuthor).toMatchObject({
      fromColumnId: 'col-todo',
      commentBody: 'Проверьте',
      commentCount: 1,
    });
  });

  it('несколько реплик подряд — одна строка, счётчик растёт, срок не едет', async () => {
    const { service, rows } = createStore();
    await service.enqueueComment(task, 'outsider', 'Раз', now);
    await service.enqueueComment(
      task,
      'outsider',
      'Два',
      new Date(now.getTime() + 60_000),
    );
    await service.enqueueComment(
      task,
      'outsider',
      'Три',
      new Date(now.getTime() + 120_000),
    );
    const forAuthor = [...rows.values()].find(
      (r) => r.recipientId === 'author',
    );
    expect(forAuthor).toMatchObject({
      commentBody: 'Три',
      commentCount: 3,
      // Окно считается от первой реплики: иначе болтливый собеседник отложил
      // бы уведомление навсегда.
      notifyAt: due,
    });
  });

  it('несколько переносов подряд — колонка первого движения не переписывается', async () => {
    const { service, rows } = createStore();
    await service.enqueueMove(task, 'outsider', 'col-todo', now);
    await service.enqueueMove(
      task,
      'outsider',
      'col-doing',
      new Date(now.getTime() + 30_000),
    );
    const forAuthor = [...rows.values()].find(
      (r) => r.recipientId === 'author',
    );
    expect(forAuthor).toMatchObject({
      fromColumnId: 'col-todo',
      notifyAt: due,
    });
  });

  it('двое правят карточку одновременно — два факта, две строки', async () => {
    // Склеивать можно только сделанное одним человеком: иначе комментарий
    // одного приехал бы подписанным именем другого.
    const { service, rows } = createStore();
    await service.enqueueComment(task, 'gopal', 'Я посмотрел', now);
    await service.enqueueMove(
      task,
      'nitai',
      'col-todo',
      new Date(now.getTime() + 10_000),
    );

    const forAuthor = [...rows.values()].filter(
      (r) => r.recipientId === 'author',
    );
    expect(forAuthor).toHaveLength(2);
    expect(forAuthor.map((r) => r.actorId).sort()).toEqual(['gopal', 'nitai']);
    expect(
      forAuthor.find((r) => r.actorId === 'gopal')?.fromColumnId,
    ).toBeNull();
    expect(
      forAuthor.find((r) => r.actorId === 'nitai')?.commentBody,
    ).toBeNull();
  });

  it('комментарий и перенос с разницей в час — окно закрылось, склейки нет', async () => {
    // Через час первая строка уже отправлена и удалена воркером. Эмулируем
    // это: склейка возможна только внутри живой строки.
    const { service, rows } = createStore();
    await service.enqueueComment(task, 'outsider', 'Вопрос', now);
    rows.clear();

    const later = new Date(now.getTime() + 60 * 60_000);
    await service.enqueueMove(task, 'outsider', 'col-todo', later);
    const forAuthor = [...rows.values()].find(
      (r) => r.recipientId === 'author',
    );
    expect(forAuthor).toMatchObject({
      commentBody: null,
      commentCount: 0,
      notifyAt: new Date(later.getTime() + WORK_NOTICE_DELAY_MS),
    });
  });
});
