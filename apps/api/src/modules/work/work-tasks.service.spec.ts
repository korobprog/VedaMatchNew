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
 * исполнителя и авторов комментариев уезжает подписанной ссылкой (VED-492).
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
    space: { prefix: 'VED' },
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
  const prisma = {
    workTask: {
      findUnique: jest.fn(({ include }: { include?: unknown }) =>
        Promise.resolve(
          include
            ? task
            : {
                id: 't1',
                spaceId: 's1',
                boardId: 'b1',
                columnId: 'c1',
                createdById: 'boris',
              },
        ),
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
      findMany: jest.fn(() => Promise.resolve([])),
      groupBy: jest.fn(() => Promise.resolve([])),
    },
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
  const service = new WorkTasksService(
    prisma,
    spaces,
    { emit: jest.fn() } as unknown as EventEmitter2,
    {} as WorkUploadsService,
    {} as WorkNoticesService,
    avatars,
  );
  return { service, resolve };
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
