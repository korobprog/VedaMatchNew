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

  it('без исполнителя — не чужая: её может взять любой', () => {
    expect(
      isForeignWorkTask({ createdById: 'mamu', assigneeId: null }, 'stas'),
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

  it('для ленты: без исполнителя хозяев не называем — чужих нет', () => {
    expect(markOwnerIds({ createdById: 'mamu', assigneeId: null })).toBe(
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
  }) {
    const calls = { findMany: 0, views: 0, groupBy: 0 };
    const prisma = {
      workActivity: {
        findMany: () => {
          calls.findMany += 1;
          return Promise.resolve(data.onBehalf ?? []);
        },
        groupBy: () => {
          calls.groupBy += 1;
          return Promise.resolve(data.changes ?? []);
        },
      },
      workTaskView: {
        findMany: () => {
          calls.views += 1;
          return Promise.resolve(data.views ?? []);
        },
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
    expect(state.get('mine')).toEqual({ foreign: false, viewed: true });
    expect(state.get('moved')).toEqual({ foreign: false, viewed: false });
    expect(state.get('theirs')).toEqual({ foreign: true, viewed: false });
    expect(state.get('by-agent')).toEqual({ foreign: false, viewed: false });
  });
});
