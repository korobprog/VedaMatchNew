import type { PrismaService } from '../../prisma/prisma.service';
import {
  isForeignWorkTask,
  isWorkTaskViewed,
  loadWorkViewerState,
  markOwnerIds,
  othersActivityWhere,
  workTaskOwnerIds,
} from './work-viewer-state';

describe('isForeignWorkTask (VED-320)', () => {
  it('составил другой и он же исполнитель — чужая', () => {
    expect(
      isForeignWorkTask({ createdById: 'mamu', assigneeId: 'mamu' }, 'stas'),
    ).toBe(true);
  });

  it('составил один, ведёт другой, я ни то ни другое — тоже чужая', () => {
    expect(
      isForeignWorkTask({ createdById: 'mamu', assigneeId: 'radha' }, 'stas'),
    ).toBe(true);
  });

  it('составил я — не чужая, кто бы её ни вёл', () => {
    // Заказчик: «все задачи, которые составлял я, не должны обозначаться
    // статусом чужое».
    expect(
      isForeignWorkTask({ createdById: 'stas', assigneeId: 'mamu' }, 'stas'),
    ).toBe(false);
  });

  it('исполнитель я — не чужая', () => {
    expect(
      isForeignWorkTask({ createdById: 'mamu', assigneeId: 'stas' }, 'stas'),
    ).toBe(false);
  });

  // VED-418: VED-296 и соседей завёл Маму без исполнителя, у Станислава они
  // стояли среди своих.
  it('без исполнителя — чужая для всех, кроме автора', () => {
    expect(
      isForeignWorkTask({ createdById: 'mamu', assigneeId: null }, 'stas'),
    ).toBe(true);
    expect(
      isForeignWorkTask({ createdById: 'mamu', assigneeId: null }, 'mamu'),
    ).toBe(false);
  });

  it('без исполнителя, заведена агентом от моего имени — моя', () => {
    expect(
      isForeignWorkTask(
        { createdById: 'sevak', createdOnBehalfOfId: 'mamu', assigneeId: null },
        'mamu',
      ),
    ).toBe(false);
    expect(
      isForeignWorkTask(
        { createdById: 'sevak', createdOnBehalfOfId: 'mamu', assigneeId: null },
        'stas',
      ),
    ).toBe(true);
  });

  it('ни автора, ни исполнителя — не чужая никому', () => {
    expect(
      isForeignWorkTask({ createdById: null, assigneeId: null }, 'stas'),
    ).toBe(false);
  });

  it('заведена агентом от моего имени — моя', () => {
    expect(
      isForeignWorkTask(
        {
          createdById: 'sevak',
          createdOnBehalfOfId: 'mamu',
          assigneeId: 'stas',
        },
        'mamu',
      ),
    ).toBe(false);
  });

  it('автор удалил аккаунт — хозяин остаётся исполнитель', () => {
    expect(
      isForeignWorkTask({ createdById: null, assigneeId: 'mamu' }, 'stas'),
    ).toBe(true);
    expect(
      isForeignWorkTask({ createdById: null, assigneeId: 'mamu' }, 'mamu'),
    ).toBe(false);
  });
});

describe('workTaskOwnerIds и markOwnerIds', () => {
  it('без повторов и пустых мест', () => {
    expect(
      workTaskOwnerIds({
        createdById: 'mamu',
        createdOnBehalfOfId: null,
        assigneeId: 'mamu',
      }),
    ).toEqual(['mamu']);
  });

  it('для ленты: без исполнителя хозяин — автор', () => {
    expect(markOwnerIds({ createdById: 'mamu', assigneeId: null })).toEqual([
      'mamu',
    ]);
    expect(markOwnerIds({ createdById: null, assigneeId: null })).toBe(
      undefined,
    );
    expect(
      markOwnerIds({
        createdById: 'sevak',
        createdOnBehalfOfId: 'mamu',
        assigneeId: 'stas',
      }),
    ).toEqual(['sevak', 'mamu', 'stas']);
  });
});

describe('isWorkTaskViewed (VED-365)', () => {
  const at = (minute: number) => new Date(Date.UTC(2026, 8, 24, 10, minute));

  it('не отмечено — не просмотрено', () => {
    expect(isWorkTaskViewed(null, null)).toBe(false);
    expect(isWorkTaskViewed(undefined, at(1))).toBe(false);
  });

  it('отмечено, и с тех пор никто другой не трогал — просмотрено', () => {
    expect(isWorkTaskViewed(at(5), null)).toBe(true);
    expect(isWorkTaskViewed(at(5), at(3))).toBe(true);
    expect(isWorkTaskViewed(at(5), at(5))).toBe(true);
  });

  it('другой перенёс или ответил после отметки — смотреть снова', () => {
    expect(isWorkTaskViewed(at(5), at(6))).toBe(false);
  });
});

describe('othersActivityWhere', () => {
  it('исключает и свои действия, и действия агента от моего имени', () => {
    expect(othersActivityWhere(['t1'], 'stas')).toEqual({
      taskId: { in: ['t1'] },
      AND: [
        { OR: [{ actorId: null }, { actorId: { not: 'stas' } }] },
        { OR: [{ onBehalfOfId: null }, { onBehalfOfId: { not: 'stas' } }] },
      ],
    });
  });
});

describe('loadWorkViewerState', () => {
  function prismaWith(data: {
    onBehalf?: Array<{ taskId: string; onBehalfOfId: string }>;
    views?: Array<{ taskId: string; viewedAt: Date }>;
    changes?: Array<{ taskId: string; _max: { createdAt: Date | null } }>;
    own?: Array<{ taskId: string; _max: { createdAt: Date | null } }>;
    visits?: Array<{ taskId: string; visitedAt: Date }>;
  }) {
    const calls = { findMany: 0, views: 0, groupBy: 0 };
    const prisma = {
      workActivity: {
        findMany: () => {
          calls.findMany += 1;
          return Promise.resolve(data.onBehalf ?? []);
        },
        // Два разреза: чужие действия (условие `AND`) и свои (`OR`).
        groupBy: (args: { where: { OR?: unknown } }) => {
          calls.groupBy += 1;
          return Promise.resolve(
            (args.where.OR ? data.own : data.changes) ?? [],
          );
        },
      },
      workTaskView: {
        findMany: () => {
          calls.views += 1;
          return Promise.resolve(data.views ?? []);
        },
      },
      workTaskVisit: {
        findMany: () => Promise.resolve(data.visits ?? []),
      },
    } as unknown as PrismaService;
    return { prisma, calls };
  }

  it('пустая доска — без запросов', async () => {
    const { prisma, calls } = prismaWith({});
    expect((await loadWorkViewerState(prisma, [], 'stas')).size).toBe(0);
    expect(calls).toEqual({ findMany: 0, views: 0, groupBy: 0 });
  });

  it('собирает оба признака на каждую карточку', async () => {
    const { prisma } = prismaWith({
      onBehalf: [{ taskId: 'by-agent', onBehalfOfId: 'stas' }],
      views: [
        { taskId: 'mine', viewedAt: new Date('2026-09-24T10:05:00Z') },
        { taskId: 'moved', viewedAt: new Date('2026-09-24T10:05:00Z') },
      ],
      changes: [
        {
          taskId: 'moved',
          _max: { createdAt: new Date('2026-09-24T10:06:00Z') },
        },
      ],
    });
    const state = await loadWorkViewerState(
      prisma,
      [
        { id: 'mine', createdById: 'stas', assigneeId: 'mamu' },
        { id: 'moved', createdById: 'mamu', assigneeId: 'stas' },
        { id: 'theirs', createdById: 'mamu', assigneeId: 'mamu' },
        { id: 'by-agent', createdById: 'sevak', assigneeId: 'mamu' },
      ],
      'stas',
    );
    expect(state.get('mine')).toMatchObject({ foreign: false, viewed: true });
    expect(state.get('moved')).toMatchObject({
      foreign: false,
      viewed: false,
    });
    expect(state.get('theirs')).toMatchObject({
      foreign: true,
      viewed: false,
    });
    expect(state.get('by-agent')).toMatchObject({
      foreign: false,
      viewed: false,
    });
  });

  it('«Последние» (VED-485): позднее из открытия и своего действия', async () => {
    const { prisma } = prismaWith({
      visits: [
        { taskId: 'opened', visitedAt: new Date('2026-09-24T10:00:00Z') },
        { taskId: 'both', visitedAt: new Date('2026-09-24T09:00:00Z') },
      ],
      own: [
        {
          taskId: 'both',
          _max: { createdAt: new Date('2026-09-24T11:00:00Z') },
        },
      ],
    });
    const state = await loadWorkViewerState(
      prisma,
      [
        { id: 'opened', createdById: 'stas', assigneeId: null },
        { id: 'both', createdById: 'stas', assigneeId: null },
        { id: 'never', createdById: 'stas', assigneeId: null },
      ],
      'stas',
    );
    expect(state.get('opened')?.touchedAt).toEqual(
      new Date('2026-09-24T10:00:00Z'),
    );
    expect(state.get('both')?.touchedAt).toEqual(
      new Date('2026-09-24T11:00:00Z'),
    );
    expect(state.get('never')?.touchedAt).toBeNull();
  });
});
