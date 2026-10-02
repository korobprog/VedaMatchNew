import type { ConfigService } from '@nestjs/config';
import type { EventEmitter2 } from '@nestjs/event-emitter';
import type { PrismaService } from '../../prisma/prisma.service';
import { WorkAvatarService } from './work-avatar.service';
import type { WorkNoticesService } from './work-notices.service';
import type { WorkSpacesService } from './work-spaces.service';
import { WorkTasksService } from './work-tasks.service';
import type { WorkUploadsService } from './work-uploads.service';

const now = new Date('2026-09-01T10:00:00Z');

function person(id: string, avatarKey: string | null) {
  return {
    id,
    name: `Имя ${id}`,
    spiritualName: null,
    avatarUrl: avatarKey ? null : `https://google/${id}.jpg`,
    avatarKey,
    isAgent: false,
  };
}

/**
 * Карточка задачи с подменённой базой: проверяется, что загруженное фото
 * исполнителя и авторов комментариев уезжает подписанной ссылкой (VED-492),
 * и как поручение (VED-507) догоняет очередь уведомлений.
 */
function build() {
  const anna = person('anna', 'avatars/anna.webp');
  const boris = person('boris', null);
  const task = {
    id: 't1',
    number: 7,
    title: 'Задача',
    description: '',
    priority: 'none',
    dueAt: null,
    position: 1,
    boardId: 'b1',
    spaceId: 's1',
    columnId: 'c1',
    assigneeId: 'anna',
    createdById: 'boris',
    completedAt: null,
    archivedAt: null,
    createdAt: now,
    updatedAt: now,
    assignee: anna,
    createdBy: boris,
    labels: [],
    checklist: [],
    _count: { comments: 2, attachments: 0 },
    space: { prefix: 'VED', name: 'Пространство' },
    column: { name: 'В работе' },
    comments: [
      {
        id: 'cm1',
        body: 'Раз',
        author: { ...anna },
        createdAt: now,
        editedAt: null,
      },
      {
        id: 'cm2',
        body: 'Два',
        author: boris,
        createdAt: now,
        editedAt: null,
      },
    ],
    attachments: [],
    activity: [],
  };
  // Состояние карточки до правки: `move()` читает его отдельным запросом.
  const before = {
    id: 't1',
    completedAt: null,
    columnId: 'c1',
    sectionColumnId: null,
    column: { id: 'c1', name: 'В работе', isDone: false },
  };
  const tx = {
    workTask: { update: jest.fn(() => Promise.resolve({ id: 't1' })) },
    workActivity: { create: jest.fn(() => Promise.resolve({})) },
    workTaskLabel: {
      deleteMany: jest.fn(() => Promise.resolve({ count: 0 })),
      createMany: jest.fn(() => Promise.resolve({ count: 0 })),
    },
  };
  const prisma = {
    workTask: {
      findUnique: jest.fn(
        (args: { select?: { completedAt?: boolean }; include?: unknown }) =>
          Promise.resolve(
            args?.select?.completedAt ? before : (task as unknown as object),
          ),
      ),
      findMany: jest.fn(() => Promise.resolve([])),
      update: jest.fn(() => Promise.resolve({ id: 't1' })),
    },
    workColumn: {
      findFirst: jest.fn(() =>
        Promise.resolve({ id: 'c2', name: 'Тестирование', isDone: false }),
      ),
      findUnique: jest.fn(() => Promise.resolve(null)),
    },
    workComment: { create: jest.fn(() => Promise.resolve({})) },
    user: {
      findUnique: jest.fn(() =>
        Promise.resolve({ name: 'Гопал', spiritualName: null }),
      ),
    },
    workSpaceMember: {
      findMany: jest.fn(() =>
        Promise.resolve([{ userId: 'anna' }, { userId: 'boris' }]),
      ),
    },
    workTaskVisit: {
      upsert: jest.fn(() => Promise.resolve({})),
      findMany: jest.fn(() => Promise.resolve([])),
    },
    workTaskView: {
      upsert: jest.fn(() => Promise.resolve({})),
      findMany: jest.fn(() => Promise.resolve([])),
    },
    workActivity: {
      create: jest.fn(() => Promise.resolve({})),
      findMany: jest.fn(() => Promise.resolve([])),
      groupBy: jest.fn(() => Promise.resolve([])),
    },
    $transaction: jest.fn((arg: unknown) =>
      typeof arg === 'function'
        ? (arg as (t: typeof tx) => Promise<unknown>)(tx)
        : Promise.all(arg as Promise<unknown>[]),
    ),
  } as unknown as PrismaService;
  const spaces = {
    roleOf: jest.fn(() => Promise.resolve('member')),
  } as unknown as WorkSpacesService;
  const avatars = new WorkAvatarService({
    get: () => undefined,
  } as unknown as ConfigService);
  const resolve = jest
    .spyOn(avatars, 'resolveAvatarUrl')
    .mockImplementation((user) =>
      Promise.resolve(
        user.avatarKey ? `https://signed/${user.avatarKey}` : user.avatarUrl,
      ),
    );
  const emit = jest.fn();
  const notices = {
    enqueueMove: jest.fn(() => Promise.resolve()),
    enqueueComment: jest.fn(() => Promise.resolve()),
    cancelOnOwnerChange: jest.fn(() => Promise.resolve([])),
  } as unknown as WorkNoticesService;
  const service = new WorkTasksService(
    prisma,
    spaces,
    { emit } as unknown as EventEmitter2,
    {} as WorkUploadsService,
    notices,
    avatars,
  );
  return { service, resolve, notices, emit };
}

describe('WorkTasksService.get — фото людей (VED-492)', () => {
  it('загруженное фото подписывается, по разу на человека', async () => {
    const { service, resolve } = build();
    const dto = await service.get('t1', 'boris');

    expect(dto.assignee?.avatarUrl).toBe('https://signed/avatars/anna.webp');
    expect(dto.comments[0].author?.avatarUrl).toBe(
      'https://signed/avatars/anna.webp',
    );
    // Фото из Google отдаётся как есть — подписывать нечего.
    expect(dto.comments[1].author?.avatarUrl).toBe('https://google/boris.jpg');
    // Анна встречается дважды — исполнитель и автор, подпись одна.
    expect(resolve).toHaveBeenCalledTimes(1);
    // Ключ хранилища наружу не едет.
    expect(JSON.stringify(dto)).not.toContain('avatarKey');
  });
});

describe('WorkTasksService.update — поручение (VED-507)', () => {
  it('исполнитель сменился — отложенная очередь по задаче гасится', async () => {
    const { service, notices } = build();
    await service.update('t1', 'boris', { assigneeId: 'gopal' });

    expect(notices.cancelOnOwnerChange).toHaveBeenCalledWith(
      't1',
      'boris',
      'gopal',
      null,
    );
  });

  it('через агента — в отмену идёт и имя человека, и его имя в ключе', async () => {
    const { service, notices } = build();
    await service.update('t1', 'agent', { assigneeId: 'gopal' }, 'boris');

    expect(notices.cancelOnOwnerChange).toHaveBeenCalledWith(
      't1',
      'agent',
      'gopal',
      'boris',
    );
  });

  it('правка без смены исполнителя — очередь не трогаем', async () => {
    const { service, notices } = build();
    await service.update('t1', 'boris', { title: 'Новое имя' });

    expect(notices.cancelOnOwnerChange).not.toHaveBeenCalled();
  });

  it('исполнитель тот же — поручения не было, очередь цела', async () => {
    const { service, notices } = build();
    await service.update('t1', 'boris', { assigneeId: 'anna' });

    expect(notices.cancelOnOwnerChange).not.toHaveBeenCalled();
  });

  it('новому исполнителю уходит «поручили задачу» (поведение сохранено)', async () => {
    const { service, emit } = build();
    await service.update('t1', 'boris', { assigneeId: 'gopal' });

    expect(emit).toHaveBeenCalledWith(
      'work.task.assigned',
      expect.objectContaining({
        recipientId: 'gopal',
        actorName: 'Гопал',
        taskKey: 'VED-7',
      }),
    );
  });

  it('себе через агента — себе не сообщаем', async () => {
    const { service, emit } = build();
    await service.update('t1', 'agent', { assigneeId: 'boris' }, 'boris');

    expect(emit).not.toHaveBeenCalledWith(
      'work.task.assigned',
      expect.anything(),
    );
  });
});

describe('WorkTasksService — очередь и on behalf (VED-507)', () => {
  it('комментарий ложится в очередь на исполнителя', async () => {
    const { service, notices } = build();
    await service.addComment('t1', 'outsider', { body: 'Вопрос' });

    expect(notices.enqueueComment).toHaveBeenCalledWith(
      expect.objectContaining({ id: 't1', assigneeId: 'anna' }),
      'outsider',
      'Вопрос',
      null,
    );
  });

  it('агент комментирует от имени человека — в очередь идёт on behalf', async () => {
    const { service, notices } = build();
    await service.addComment('t1', 'agent', { body: 'Привет' }, 'boris');

    expect(notices.enqueueComment).toHaveBeenCalledWith(
      expect.objectContaining({ id: 't1' }),
      'agent',
      'Привет',
      'boris',
    );
  });

  it('агент переносит от имени человека — в очередь идёт on behalf', async () => {
    const { service, notices } = build();
    await service.move(
      't1',
      'agent',
      { columnId: 'c2', afterTaskId: null, beforeTaskId: null },
      'boris',
    );

    expect(notices.enqueueMove).toHaveBeenCalledWith(
      expect.objectContaining({ id: 't1', assigneeId: 'anna' }),
      'agent',
      'c1',
      'boris',
    );
  });
});
