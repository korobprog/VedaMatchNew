import { WorkNoticesService } from './work-notices.service';
import type { PrismaService } from '../../prisma/prisma.service';
import { WORK_NOTICE_DELAY_MS } from './work-notice';

type Row = {
  id: string;
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

/** Условие из `deleteMany`, насколько его здесь используют. */
type Where = {
  taskId?: string;
  recipientId?: string | { in: string[] };
  id?: { in: string[] };
  claimedAt?: null;
};

function matches(row: Row, where: Where): boolean {
  if (where.taskId !== undefined && row.taskId !== where.taskId) return false;
  if (where.claimedAt === null && row.claimedAt !== null) return false;
  if (typeof where.recipientId === 'string') {
    if (row.recipientId !== where.recipientId) return false;
  } else if (where.recipientId && !where.recipientId.in.includes(row.recipientId)) {
    return false;
  }
  if (where.id && !where.id.in.includes(row.id)) return false;
  return true;
}

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
      findMany: ({
        where,
      }: {
        where: { taskId: string };
        select: { id: true; recipientId: true };
      }) =>
        Promise.resolve(
          [...rows.values()]
            .filter((row) => row.taskId === where.taskId)
            .map((row) => ({ id: row.id, recipientId: row.recipientId })),
        ),
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
            id: slot,
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
      deleteMany: ({ where }: { where: Where }) => {
        let count = 0;
        for (const [slot, row] of rows) {
          if (matches(row, where)) {
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
  it('уведомление — исполнителю; автор, поручивший задачу, его не получает (VED-507)', async () => {
    const { service, rows } = createStore();
    await service.enqueueMove(task, 'author', 'col-todo', null, now);
    expect([...rows.values()].map((row) => row.recipientId)).toEqual([
      'assignee',
    ]);
  });

  it('исполнитель работает с задачей — автору не всплывает (VED-507)', async () => {
    const { service, rows } = createStore();
    await service.enqueueMove(task, 'assignee', 'col-todo', null, now);
    await service.enqueueComment(task, 'assignee', 'Сделал', null, now);
    expect(rows.size).toBe(0);
  });

  it('без исполнителя — автору', async () => {
    const { service, rows } = createStore();
    const orphan = { id: 'task-3', assigneeId: null, createdById: 'author' };
    await service.enqueueComment(orphan, 'outsider', 'Кто возьмёт?', null, now);
    expect([...rows.values()].map((row) => row.recipientId)).toEqual([
      'author',
    ]);
  });

  it('человек и исполнитель, и автор — получатель один, и он же молчит о себе', async () => {
    const { service, rows } = createStore();
    const solo = { id: 'task-2', assigneeId: 'gopal', createdById: 'gopal' };
    await service.enqueueComment(solo, 'gopal', 'Сам с собой', null, now);
    expect(rows.size).toBe(0);
  });

  it('комментарий постороннего — исполнителю', async () => {
    const { service, rows } = createStore();
    await service.enqueueComment(task, 'outsider', 'Вопрос', null, now);
    expect([...rows.values()].map((row) => row.recipientId)).toEqual([
      'assignee',
    ]);
  });

  it('сам поработал с задачей — своё дозревающее уведомление снимается', async () => {
    // «Зачем ему снова утыкаться в то что он сам только что исправил» —
    // строку исполнителю мог завести кто-то другой минутой раньше.
    const { service, rows } = createStore();
    await service.enqueueMove(task, 'author', 'col-todo', null, now);
    expect([...rows.values()].map((row) => row.recipientId)).toEqual([
      'assignee',
    ]);

    await service.enqueueComment(task, 'assignee', 'Уже чиню', null, now);
    expect(rows.size).toBe(0);
  });

  it('взятую воркером строку тоже снимаем — иначе она уйдёт в тот же тик (VED-507)', async () => {
    // Воркер читает запись заново перед отправкой: снять её — значит отменить
    // отправку. Не снимали бы — человек получил бы новость о действии, которое
    // только что совершил сам.
    const { service, rows } = createStore();
    await service.enqueueMove(task, 'author', 'col-todo', null, now);
    for (const row of rows.values()) row.claimedAt = now;
    await service.enqueueComment(task, 'assignee', 'Уже чиню', null, now);
    expect(rows.size).toBe(0);
  });
});

describe('WorkNoticesService — агент действует от имени человека (VED-507)', () => {
  it('строка не заводится на того, от чьего имени работали', async () => {
    const { service, rows } = createStore();
    await service.enqueueMove(task, 'agent', 'col-todo', 'author', now);
    expect([...rows.values()].map((row) => row.recipientId)).toEqual([
      'assignee',
    ]);
  });

  it('агент перенёс задачу от имени исполнителя — его отложенная строка снимается', async () => {
    const { service, rows } = createStore();
    await service.enqueueComment(task, 'outsider', 'Вопрос', null, now);
    expect(rows.size).toBe(1);

    await service.enqueueMove(task, 'agent', 'col-todo', 'assignee', now);
    expect(rows.size).toBe(0);
  });

  it('агент от имени человека, которому задача не поручена, — строка исполнителя остаётся', async () => {
    const { service, rows } = createStore();
    await service.enqueueComment(task, 'outsider', 'Вопрос', null, now);
    await service.enqueueMove(task, 'agent', 'col-todo', 'author', now);
    // Две строки на одного получателя — по ключу «кто действовал»; новость
    // исполнителю положена, гасить её нельзя.
    expect([...rows.values()].map((row) => row.actorId).sort()).toEqual([
      'agent',
      'outsider',
    ]);
  });
});

describe('WorkNoticesService — поручил задачу (VED-507)', () => {
  it('поручение снимает отложенную строку поручившего и прежнего исполнителя', async () => {
    // Строка на исполнителя заведена раньше чужой рукой; теперь он сам
    // поручает задачу другому — всплывать ему о ней больше нечем.
    const { service, rows } = createStore();
    await service.enqueueComment(task, 'outsider', 'Вопрос', null, now);
    expect([...rows.values()].map((row) => row.recipientId)).toEqual([
      'assignee',
    ]);

    const cancelled = await service.cancelOnOwnerChange(
      'task-1',
      'assignee',
      'sevak',
    );
    expect(cancelled).toEqual(['assignee']);
    expect(rows.size).toBe(0);
  });

  it('строка нынешнего владельца поручением не страдает', async () => {
    const { service, rows } = createStore();
    await service.enqueueComment(task, 'outsider', 'Вопрос', null, now);

    // Задачу поручили исполнителю же (владелец не сменился), поручал автор.
    const cancelled = await service.cancelOnOwnerChange(
      'task-1',
      'author',
      'assignee',
    );
    expect(cancelled).toEqual([]);
    expect(rows.size).toBe(1);
  });

  it('поручение через агента — от имени человека гасит и его строку', async () => {
    const { service, rows } = createStore();
    await service.enqueueComment(task, 'outsider', 'Вопрос', null, now);

    const cancelled = await service.cancelOnOwnerChange(
      'task-1',
      'agent',
      'sevak',
      'assignee',
    );
    expect(cancelled).toEqual(['assignee']);
    expect(rows.size).toBe(0);
  });

  it('строки на воркере висят — их тоже отменяем, пока не отправлены', async () => {
    const { service, rows } = createStore();
    await service.enqueueComment(task, 'outsider', 'Вопрос', null, now);
    for (const row of rows.values()) row.claimedAt = now;

    await service.cancelOnOwnerChange('task-1', 'assignee', 'sevak');
    expect(rows.size).toBe(0);
  });
});

describe('WorkNoticesService — склейка окна', () => {
  it('комментарий и перенос одного человека ложатся в одну строку', async () => {
    const { service, rows } = createStore();
    await service.enqueueComment(task, 'outsider', 'Проверьте', null, now);
    await service.enqueueMove(
      task,
      'outsider',
      'col-todo',
      null,
      new Date(now.getTime() + 5_000),
    );

    expect(rows.size).toBe(1); // строка на получателя, не на действие
    const forAssignee = [...rows.values()].find(
      (r) => r.recipientId === 'assignee',
    );
    expect(forAssignee).toMatchObject({
      fromColumnId: 'col-todo',
      commentBody: 'Проверьте',
      commentCount: 1,
      notifyAt: due,
    });
  });

  it('перенос, потом комментарий — тот же результат', async () => {
    const { service, rows } = createStore();
    await service.enqueueMove(task, 'outsider', 'col-todo', null, now);
    await service.enqueueComment(
      task,
      'outsider',
      'Проверьте',
      null,
      new Date(now.getTime() + 5_000),
    );
    const forAssignee = [...rows.values()].find(
      (r) => r.recipientId === 'assignee',
    );
    expect(forAssignee).toMatchObject({
      fromColumnId: 'col-todo',
      commentBody: 'Проверьте',
      commentCount: 1,
    });
  });

  it('несколько реплик подряд — одна строка, счётчик растёт, срок не едет', async () => {
    const { service, rows } = createStore();
    await service.enqueueComment(task, 'outsider', 'Раз', null, now);
    await service.enqueueComment(
      task,
      'outsider',
      'Два',
      null,
      new Date(now.getTime() + 60_000),
    );
    await service.enqueueComment(
      task,
      'outsider',
      'Три',
      null,
      new Date(now.getTime() + 120_000),
    );
    const forAssignee = [...rows.values()].find(
      (r) => r.recipientId === 'assignee',
    );
    expect(forAssignee).toMatchObject({
      commentBody: 'Три',
      commentCount: 3,
      // Окно считается от первой реплики: иначе болтливый собеседник отложил
      // бы уведомление навсегда.
      notifyAt: due,
    });
  });

  it('несколько переносов подряд — колонка первого движения не переписывается', async () => {
    const { service, rows } = createStore();
    await service.enqueueMove(task, 'outsider', 'col-todo', null, now);
    await service.enqueueMove(
      task,
      'outsider',
      'col-doing',
      null,
      new Date(now.getTime() + 30_000),
    );
    const forAssignee = [...rows.values()].find(
      (r) => r.recipientId === 'assignee',
    );
    expect(forAssignee).toMatchObject({
      fromColumnId: 'col-todo',
      notifyAt: due,
    });
  });

  it('двое правят карточку одновременно — два факта, две строки', async () => {
    // Склеивать можно только сделанное одним человеком: иначе комментарий
    // одного приехал бы подписанным именем другого.
    const { service, rows } = createStore();
    await service.enqueueComment(task, 'gopal', 'Я посмотрел', null, now);
    await service.enqueueMove(
      task,
      'nitai',
      'col-todo',
      null,
      new Date(now.getTime() + 10_000),
    );

    const forAssignee = [...rows.values()].filter(
      (r) => r.recipientId === 'assignee',
    );
    expect(forAssignee).toHaveLength(2);
    expect(forAssignee.map((r) => r.actorId).sort()).toEqual([
      'gopal',
      'nitai',
    ]);
    expect(
      forAssignee.find((r) => r.actorId === 'gopal')?.fromColumnId,
    ).toBeNull();
    expect(
      forAssignee.find((r) => r.actorId === 'nitai')?.commentBody,
    ).toBeNull();
  });

  it('комментарий и перенос с разницей в час — окно закрылось, склейки нет', async () => {
    // Через час первая строка уже отправлена и удалена воркером. Эмулируем
    // это: склейка возможна только внутри живой строки.
    const { service, rows } = createStore();
    await service.enqueueComment(task, 'outsider', 'Вопрос', null, now);
    rows.clear();

    const later = new Date(now.getTime() + 60 * 60_000);
    await service.enqueueMove(task, 'outsider', 'col-todo', null, later);
    const forAssignee = [...rows.values()].find(
      (r) => r.recipientId === 'assignee',
    );
    expect(forAssignee).toMatchObject({
      commentBody: null,
      commentCount: 0,
      notifyAt: new Date(later.getTime() + WORK_NOTICE_DELAY_MS),
    });
  });
});
