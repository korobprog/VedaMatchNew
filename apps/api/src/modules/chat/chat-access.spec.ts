import {
  canDeleteMessage,
  canEditMessage,
  canInvite,
  canPinMessage,
  canRead,
  denyJoin,
  denyRemoveMember,
  denySetRole,
  canWrite,
  denyWrite,
  type ConversationAccessInput,
  type MemberAccessInput,
} from './chat-access';

const member = (over: Partial<MemberAccessInput> = {}): MemberAccessInput => ({
  userId: 'me',
  role: 'member',
  ...over,
});

const direct = (
  over: Partial<ConversationAccessInput> = {},
): ConversationAccessInput => ({
  kind: 'direct',
  state: 'active',
  ...over,
});

describe('canRead', () => {
  it('пускает участника и не пускает постороннего', () => {
    expect(canRead(member())).toBe(true);
    expect(canRead(null)).toBe(false);
  });

  it('оставляет доступ вышедшему: переписка не исчезает задним числом', () => {
    expect(canRead(member({ leftAt: new Date() }))).toBe(true);
  });
});

describe('denyWrite', () => {
  it('в активном диалоге разрешает писать участнику', () => {
    expect(denyWrite(direct(), member())).toBeNull();
  });

  it('не пускает постороннего и вышедшего', () => {
    expect(denyWrite(direct(), null)).toBe('not_member');
    expect(denyWrite(direct(), member({ leftAt: new Date() }))).toBe('left');
  });

  it('запрос даёт автору ровно одно сообщение', () => {
    const conversation = direct({ state: 'request', requestedById: 'me' });
    expect(
      denyWrite({ ...conversation, messageCount: 0 }, member()),
    ).toBeNull();
    expect(denyWrite({ ...conversation, messageCount: 1 }, member())).toBe(
      'request_awaiting_answer',
    );
  });

  it('получателю запроса писать нельзя, пока он не принял', () => {
    const conversation = direct({ state: 'request', requestedById: 'other' });
    expect(denyWrite(conversation, member())).toBe('request_not_yours');
  });

  it('в отклонённый и убранный в архив диалог не пишут', () => {
    expect(denyWrite(direct({ state: 'declined' }), member())).toBe('declined');
    expect(denyWrite(direct({ state: 'archived' }), member())).toBe('archived');
  });

  it('в канал пишут только владелец и админ', () => {
    const channel = direct({ kind: 'channel' });
    expect(denyWrite(channel, member())).toBe('channel_readers_do_not_write');
    expect(denyWrite(channel, member({ role: 'admin' }))).toBeNull();
    expect(denyWrite(channel, member({ role: 'owner' }))).toBeNull();
  });

  it('читатель канала комментирует пост, но не пишет в ленту', () => {
    const channel = direct({ kind: 'channel' });
    expect(denyWrite({ ...channel, isComment: true }, member())).toBeNull();
    expect(denyWrite(channel, member())).toBe('channel_readers_do_not_write');
  });

  it('в группе пишут все участники', () => {
    expect(denyWrite(direct({ kind: 'group' }), member())).toBeNull();
  });
});

describe('canWrite', () => {
  it('повторяет denyWrite булевым ответом', () => {
    expect(canWrite(direct(), member())).toBe(true);
    expect(canWrite(direct({ state: 'declined' }), member())).toBe(false);
  });
});

describe('canInvite', () => {
  it('в личный диалог звать некого', () => {
    expect(canInvite(direct(), member({ role: 'owner' }))).toBe(false);
  });

  it('в группу зовёт владелец и админ, но не рядовой участник', () => {
    const group = direct({ kind: 'group' });
    expect(canInvite(group, member({ role: 'owner' }))).toBe(true);
    expect(canInvite(group, member({ role: 'admin' }))).toBe(true);
    expect(canInvite(group, member())).toBe(false);
  });
});

describe('denyJoin', () => {
  it('в открытую группу или канал входят сами', () => {
    expect(
      denyJoin(direct({ kind: 'group', visibility: 'public' })),
    ).toBeNull();
    expect(
      denyJoin(direct({ kind: 'channel', visibility: 'public' })),
    ).toBeNull();
  });

  it('в закрытую — только по приглашению', () => {
    expect(denyJoin(direct({ kind: 'group', visibility: 'private' }))).toBe(
      'private',
    );
    // Умолчание тоже закрытое: беседа без явной настройки не должна
    // оказаться публичной.
    expect(denyJoin(direct({ kind: 'group' }))).toBe('private');
  });

  it('личный диалог не открывают вовсе', () => {
    expect(denyJoin(direct({ visibility: 'public' }))).toBe(
      'direct_is_not_public',
    );
  });

  it('в замороженную не входят даже при публичности', () => {
    expect(
      denyJoin(
        direct({ kind: 'group', visibility: 'public', state: 'archived' }),
      ),
    ).toBe('not_active');
  });
});

describe('denyRemoveMember', () => {
  const group = direct({ kind: 'group' });

  it('владелец убирает и участника, и администратора', () => {
    const owner = member({ role: 'owner' });
    expect(denyRemoveMember(group, owner, member({ userId: 'x' }))).toBeNull();
    expect(
      denyRemoveMember(group, owner, member({ userId: 'x', role: 'admin' })),
    ).toBeNull();
  });

  it('администратор убирает участника, но не другого администратора', () => {
    const admin = member({ role: 'admin' });
    expect(denyRemoveMember(group, admin, member({ userId: 'x' }))).toBeNull();
    expect(
      denyRemoveMember(group, admin, member({ userId: 'x', role: 'admin' })),
    ).toBe('not_allowed');
  });

  it('владельца не убирает никто', () => {
    expect(
      denyRemoveMember(
        group,
        member({ role: 'owner' }),
        member({ userId: 'x', role: 'owner' }),
      ),
    ).toBe('owner_is_untouchable');
  });

  it('рядовой участник никого не убирает', () => {
    expect(denyRemoveMember(group, member(), member({ userId: 'x' }))).toBe(
      'not_allowed',
    );
  });

  it('в личном диалоге ролей нет вовсе', () => {
    expect(
      denyRemoveMember(
        direct(),
        member({ role: 'owner' }),
        member({ userId: 'x' }),
      ),
    ).toBe('direct_has_no_roles');
  });
});

describe('denySetRole', () => {
  const group = direct({ kind: 'group' });

  it('права раздаёт только владелец', () => {
    expect(
      denySetRole(group, member({ role: 'owner' }), member({ userId: 'x' })),
    ).toBeNull();
    expect(
      denySetRole(group, member({ role: 'admin' }), member({ userId: 'x' })),
    ).toBe('owner_sets_roles');
  });

  it('роль владельца не меняется', () => {
    expect(
      denySetRole(
        group,
        member({ role: 'owner' }),
        member({ userId: 'x', role: 'owner' }),
      ),
    ).toBe('owner_is_untouchable');
  });
});

describe('canPinMessage', () => {
  it('в личном диалоге закрепляет любой из двоих', () => {
    expect(canPinMessage(direct(), member())).toBe(true);
  });

  it('в группе закрепляет владелец и админ, но не рядовой участник', () => {
    const group = direct({ kind: 'group' });
    expect(canPinMessage(group, member({ role: 'owner' }))).toBe(true);
    expect(canPinMessage(group, member({ role: 'admin' }))).toBe(true);
    expect(canPinMessage(group, member())).toBe(false);
  });

  it('вышедший из беседы не закрепляет', () => {
    expect(canPinMessage(direct(), member({ leftAt: new Date() }))).toBe(false);
  });
});

describe('canEditMessage', () => {
  it('правит только автор', () => {
    expect(canEditMessage('me', member())).toBe(true);
    expect(canEditMessage('other', member())).toBe(false);
  });

  it('вышедший не правит даже своё', () => {
    expect(canEditMessage('me', member({ leftAt: new Date() }))).toBe(false);
  });
});

describe('canDeleteMessage', () => {
  it('автор удаляет своё в любой беседе', () => {
    expect(canDeleteMessage('me', direct(), member())).toBe(true);
  });

  it('в личном диалоге чужое сообщение не удаляется', () => {
    expect(canDeleteMessage('other', direct(), member())).toBe(false);
  });

  it('в группе чужое удаляет владелец, но не рядовой участник', () => {
    const group = direct({ kind: 'group' });
    expect(canDeleteMessage('other', group, member({ role: 'owner' }))).toBe(
      true,
    );
    expect(canDeleteMessage('other', group, member())).toBe(false);
  });
});
