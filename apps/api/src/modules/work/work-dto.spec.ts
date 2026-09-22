import {
  toWorkAgendaItem,
  toWorkAgendaResponse,
  toWorkMember,
  toWorkPerson,
  toWorkPersonRef,
  toWorkTaskCard,
  workAgendaBucket,
  type WorkTaskRow,
} from './work-dto';

const worldly = {
  id: 'u1',
  name: 'Максим',
  spiritualName: null,
  avatarUrl: null,
  isAgent: false,
};
const devotee = {
  id: 'u2',
  name: 'Максим',
  spiritualName: 'Мадхава дас',
  avatarUrl: 'https://cdn/a.jpg',
  isAgent: false,
};
/** Служебный аккаунт ИИ: имя есть, лица нет. */
const agent = {
  id: 'sevak',
  name: 'Севак',
  spiritualName: null,
  avatarUrl: null,
  isAgent: true,
};

describe('toWorkMember', () => {
  it('наружу едет духовное имя, когда оно есть', () => {
    const member = toWorkMember({
      role: 'admin',
      joinedAt: new Date('2026-09-01T00:00:00.000Z'),
      user: devotee,
    });
    expect(member.name).toBe('Мадхава дас');
    expect(member.role).toBe('admin');
    expect(member.joinedAt).toBe('2026-09-01T00:00:00.000Z');
  });

  it('без духовного имени — мирское', () => {
    expect(
      toWorkMember({ role: 'member', joinedAt: new Date(), user: worldly })
        .name,
    ).toBe('Максим');
  });
});

function taskRow(overrides: Partial<WorkTaskRow> = {}): WorkTaskRow {
  return {
    id: 't1',
    number: 14,
    columnId: 'c1',
    title: 'Сверстать лендинг',
    description: '',
    position: 1024,
    priority: 'normal',
    dueAt: null,
    completedAt: null,
    assignee: null,
    labels: [],
    checklist: [],
    _count: { comments: 0, attachments: 0 },
    createdAt: new Date('2026-09-01T00:00:00.000Z'),
    ...overrides,
  };
}

describe('toWorkTaskCard', () => {
  it('собирает читаемый номер из префикса среды', () => {
    expect(toWorkTaskCard(taskRow(), 'VM').key).toBe('VM-14');
  });

  it('описание на доску не едет — только признак, что оно есть', () => {
    const card = toWorkTaskCard(taskRow({ description: 'Много текста' }), 'VM');
    expect(card.hasDescription).toBe(true);
    expect(Object.keys(card)).not.toContain('description');
  });

  it('описание из одних пробелов описанием не считается', () => {
    expect(
      toWorkTaskCard(taskRow({ description: '   ' }), 'VM').hasDescription,
    ).toBe(false);
  });

  it('считает отмеченные пункты чек-листа', () => {
    const card = toWorkTaskCard(
      taskRow({ checklist: [{ done: true }, { done: false }, { done: true }] }),
      'VM',
    );
    expect(card.checklistDone).toBe(2);
    expect(card.checklistTotal).toBe(3);
  });

  it('исполнитель показывается духовным именем', () => {
    expect(
      toWorkTaskCard(taskRow({ assignee: devotee }), 'VM').assignee?.name,
    ).toBe('Мадхава дас');
  });

  it('метки переносит вместе с цветом-токеном', () => {
    const card = toWorkTaskCard(
      taskRow({
        labels: [{ label: { id: 'l1', name: 'срочно', color: 'gold' } }],
      }),
      'VM',
    );
    expect(card.labels).toEqual([{ id: 'l1', name: 'срочно', color: 'gold' }]);
  });

  it('дата создания едет строкой ISO — вид «По дате» группирует по ней', () => {
    const card = toWorkTaskCard(
      taskRow({ createdAt: new Date('2026-09-05T08:30:00.000Z') }),
      'VM',
    );
    expect(card.createdAt).toBe('2026-09-05T08:30:00.000Z');
  });
});

describe('workAgendaBucket', () => {
  const now = new Date('2026-09-07T15:00:00.000Z');

  it('без срока — своя стопка', () => {
    expect(workAgendaBucket(null, now)).toBe('undated');
  });

  it('срок в прошлом — просрочено', () => {
    expect(workAgendaBucket(new Date('2026-09-06T10:00:00.000Z'), now)).toBe(
      'overdue',
    );
  });

  it('срок сегодня позже — сегодня', () => {
    const later = new Date(now);
    later.setHours(23, 0, 0, 0);
    expect(workAgendaBucket(later, now)).toBe('today');
  });

  it('завтра — уже не сегодня, даже если до срока два часа', () => {
    const endOfToday = new Date(now);
    endOfToday.setHours(23, 59, 59, 999);
    const soon = new Date(endOfToday.getTime() + 60 * 60 * 1000);
    expect(workAgendaBucket(soon, now)).toBe('soon');
  });
});

describe('toWorkAgendaItem', () => {
  it('несёт с собой среду: экран сводный, и без неё задача безадресна', () => {
    const item = toWorkAgendaItem(
      {
        id: 't1',
        number: 3,
        title: 'Позвонить',
        boardId: 'b1',
        dueAt: new Date('2026-09-08T09:00:00.000Z'),
        priority: 'high',
      },
      { id: 's1', name: 'Veda Match', prefix: 'VM', color: 'cyan' },
    );
    expect(item.key).toBe('VM-3');
    expect(item.spaceName).toBe('Veda Match');
    expect(item.spaceColor).toBe('cyan');
    expect(item.dueAt).toBe('2026-09-08T09:00:00.000Z');
  });
});

describe('toWorkAgendaResponse', () => {
  const row = {
    responseId: 'r1',
    offerId: 'o1',
    offerTitle: 'Повар',
    offerKind: 'work',
    status: 'in_dialog',
    updatedAt: new Date('2026-09-08T10:00:00Z'),
  };

  it('переносит известные вид и статус как есть', () => {
    expect(toWorkAgendaResponse(row)).toEqual({
      responseId: 'r1',
      offerId: 'o1',
      offerTitle: 'Повар',
      offerKind: 'work',
      status: 'in_dialog',
      updatedAt: '2026-09-08T10:00:00.000Z',
    });
  });

  it('незнакомые вид и статус чужого сервиса не ломают агенду', () => {
    // «Вакансии» могут завести новый вид раньше, чем Работа о нём узнает.
    const dto = toWorkAgendaResponse({
      ...row,
      offerKind: 'internship',
      status: 'shortlisted',
    });
    expect(dto.offerKind).toBe('task');
    expect(dto.status).toBe('new');
  });
});

describe('признак ИИ-агента', () => {
  it('едет наружу и у исполнителя карточки, и у участника среды', () => {
    // Без него агент рисуется тем же кружком с буквой, что и живой человек.
    expect(toWorkTaskCard(taskRow({ assignee: agent }), 'VM').assignee).toEqual(
      expect.objectContaining({ name: 'Севак', isAgent: true }),
    );
    expect(
      toWorkMember({ role: 'member', joinedAt: new Date(), user: agent })
        .isAgent,
    ).toBe(true);
  });

  it('у людей остаётся false', () => {
    expect(toWorkPerson(devotee).isAgent).toBe(false);
    expect(
      toWorkTaskCard(taskRow({ assignee: worldly }), 'VM').assignee?.isAgent,
    ).toBe(false);
  });

  it('там, где аватар не рисуется, признак всё равно есть', () => {
    // Автор карточки и лицо в истории показываются без фото, но отличать ИИ
    // от человека нужно и там.
    expect(toWorkPersonRef(agent)).toEqual({
      userId: 'sevak',
      name: 'Севак',
      isAgent: true,
    });
    expect(toWorkPersonRef(devotee)).toEqual({
      userId: 'u2',
      name: 'Мадхава дас',
      isAgent: false,
    });
  });
});
