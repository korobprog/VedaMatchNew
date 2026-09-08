import { WORK_EVENTS, workTaskRecipients } from './work-events';

describe('WORK_EVENTS', () => {
  it('имена совпадают с контрактом уведомлений', () => {
    expect(Object.values(WORK_EVENTS)).toEqual([
      'work.task.assigned',
      'work.task.commented',
      'work.task.returned',
      'work.task.status-changed',
      'work.invite.received',
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
