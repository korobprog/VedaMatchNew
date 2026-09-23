import { sortInboxRows } from './inbox-order';
import {
  isUniqueViolation,
  liftRecipients,
  threadLiftData,
  threadRefreshData,
  workStatusThreadKey,
} from './inbox-thread';
import { workTaskUrl } from './notification-copy';

describe('workStatusThreadKey', () => {
  it('строится от адреса карточки: один ключ на задачу', () => {
    expect(workStatusThreadKey(workTaskUrl('space-1', 'VED-42'))).toBe(
      'work-status:/work/planner/space-1?task=VED-42',
    );
  });

  it('разные задачи и разные среды — разные ветки', () => {
    const keys = new Set([
      workStatusThreadKey(workTaskUrl('space-1', 'VED-42')),
      workStatusThreadKey(workTaskUrl('space-1', 'VED-43')),
      workStatusThreadKey(workTaskUrl('space-2', 'VED-42')),
    ]);
    expect(keys.size).toBe(3);
  });
});

describe('threadRefreshData', () => {
  const now = new Date('2026-09-23T12:10:00Z');

  it('переписывает новость целиком и поднимает строку непрочитанной', () => {
    expect(
      threadRefreshData(
        {
          title: 'VED-42: сменился статус',
          body: 'Маму: «Починить» — из «Тестирование»',
          url: '/work/planner/space-1?task=VED-42',
          category: 'work',
          mark: 'done',
        },
        now,
      ),
    ).toEqual({
      title: 'VED-42: сменился статус',
      body: 'Маму: «Починить» — из «Тестирование»',
      url: '/work/planner/space-1?task=VED-42',
      category: 'work',
      mark: 'done',
      createdAt: now,
      readAt: null,
    });
  });
});

describe('threadLiftData', () => {
  it('поднятая строка встаёт первой по правилу ленты VED-153', () => {
    const now = new Date('2026-09-23T12:10:00Z');
    const rows = [
      // Непрочитанное о другом, свежее строки задачи.
      {
        id: 'other',
        createdAt: new Date('2026-09-23T12:05:00Z'),
        readAt: null,
      },
      // Строка задачи, прочитанная давно.
      {
        id: 'task',
        createdAt: new Date('2026-09-23T11:00:00Z'),
        readAt: new Date('2026-09-23T11:01:00Z') as Date | null,
      },
    ];

    const lifted = rows.map((row) =>
      row.id === 'task' ? { ...row, ...threadLiftData(now) } : row,
    );

    expect(sortInboxRows(lifted).map((row) => row.id)).toEqual([
      'task',
      'other',
    ]);
  });

  it('без сброса прочтения строка осталась бы под непрочитанным', () => {
    // Потому подъём и делает строку непрочитанной: одна свежая дата её наверх
    // не выводит.
    const rows = [
      {
        id: 'other',
        createdAt: new Date('2026-09-23T12:05:00Z'),
        readAt: null,
      },
      {
        id: 'task',
        createdAt: new Date('2026-09-23T12:10:00Z'),
        readAt: new Date('2026-09-23T11:01:00Z') as Date | null,
      },
    ];
    expect(sortInboxRows(rows).map((row) => row.id)).toEqual(['other', 'task']);
  });
});

describe('liftRecipients', () => {
  it('убирает повторы и пустые', () => {
    expect(liftRecipients(['u2', '', 'u2', 'u3'])).toEqual(['u2', 'u3']);
  });

  it('нет списка — нет подъёма', () => {
    expect(liftRecipients(undefined)).toEqual([]);
    expect(liftRecipients([])).toEqual([]);
  });
});

describe('isUniqueViolation', () => {
  it('узнаёт нарушение уникальности Prisma', () => {
    expect(isUniqueViolation({ code: 'P2002' })).toBe(true);
  });

  it('прочие ошибки — не она', () => {
    expect(isUniqueViolation({ code: 'P2025' })).toBe(false);
    expect(isUniqueViolation(new Error('boom'))).toBe(false);
    expect(isUniqueViolation(null)).toBe(false);
    expect(isUniqueViolation('P2002')).toBe(false);
  });
});
