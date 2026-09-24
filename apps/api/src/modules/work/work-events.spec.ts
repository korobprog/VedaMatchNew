import {
  WORK_EVENTS,
  workTaskLiftRecipients,
  workTaskRecipients,
} from './work-events';

describe('WORK_EVENTS', () => {
  it('имена совпадают с контрактом уведомлений', () => {
    expect(Object.values(WORK_EVENTS)).toEqual([
      'work.task.assigned',
      'work.task.commented',
      'work.task.returned',
      'work.task.status-changed',
      'work.invite.received',
      'work.overtime.requested',
      'work.overtime.decided',
      'work.payout.closed',
      'work.payout.paid',
    ]);
  });
});

describe('workTaskRecipients', () => {
  const task = { assigneeId: 'assignee', createdById: 'author' };

  it('оповещает исполнителя и автора', () => {
    expect(workTaskRecipients(task, 'someone').sort()).toEqual([
      'assignee',
      'author',
    ]);
  });

  it('себе о своём действии не пишет', () => {
    expect(workTaskRecipients(task, 'assignee')).toEqual(['author']);
    expect(workTaskRecipients(task, 'author')).toEqual(['assignee']);
  });

  it('автор он же исполнитель — один получатель, а не два', () => {
    expect(
      workTaskRecipients({ assigneeId: 'me', createdById: 'me' }, 'other'),
    ).toEqual(['me']);
  });

  it('своя задача без второго участника — оповещать некого', () => {
    expect(
      workTaskRecipients({ assigneeId: 'me', createdById: 'me' }, 'me'),
    ).toEqual([]);
  });

  it('удалённый автор и пустой исполнитель не превращаются в получателей', () => {
    expect(
      workTaskRecipients({ assigneeId: null, createdById: null }, 'me'),
    ).toEqual([]);
  });
});

describe('workTaskLiftRecipients (VED-320)', () => {
  const task = { assigneeId: 'stas', createdById: 'mamu' };

  it('поднимает задачу у второго, но не у того, кто двигал', () => {
    expect(workTaskLiftRecipients(task, 'mamu', ['mamu', 'stas'])).toEqual([
      'stas',
    ]);
    expect(workTaskLiftRecipients(task, 'stas', ['mamu', 'stas'])).toEqual([
      'mamu',
    ]);
  });

  it('двигает третий — поднимается у обоих', () => {
    expect(
      workTaskLiftRecipients(task, 'agent', ['mamu', 'stas', 'agent']).sort(),
    ).toEqual(['mamu', 'stas']);
  });

  it('автор и исполнитель в одном лице двигает сам — поднимать некому', () => {
    expect(
      workTaskLiftRecipients(
        { assigneeId: 'mamu', createdById: 'mamu' },
        'mamu',
        ['mamu', 'stas'],
      ),
    ).toEqual([]);
  });

  it('исключённому из среды задача не поднимается', () => {
    expect(workTaskLiftRecipients(task, 'mamu', ['mamu'])).toEqual([]);
  });
});
