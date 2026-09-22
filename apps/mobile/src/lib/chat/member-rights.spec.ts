import type { ChatUserSummary } from '@vedamatch/shared';
import {
  canDeleteConversation,
  canEditConversation,
  canInvite,
  canRemoveMember,
  canSetRole,
  inviteCandidates,
  leaveLabel,
  nextRoleAction,
} from './member-rights';

describe('canInvite', () => {
  it('владелец и администратор зовут в группу', () => {
    expect(canInvite('group', 'owner')).toBe(true);
    expect(canInvite('group', 'admin')).toBe(true);
  });

  it('рядовой участник не зовёт', () => {
    expect(canInvite('group', 'member')).toBe(false);
  });

  it('в личный диалог не зовут даже владельцем', () => {
    expect(canInvite('direct', 'owner')).toBe(false);
  });
});

describe('canEditConversation', () => {
  it('название меняет администрация беседы', () => {
    expect(canEditConversation('channel', 'admin')).toBe(true);
    expect(canEditConversation('channel', 'member')).toBe(false);
  });

  it('у личного диалога названия нет', () => {
    expect(canEditConversation('direct', 'owner')).toBe(false);
  });
});

describe('canDeleteConversation', () => {
  it('удаляет только владелец', () => {
    expect(canDeleteConversation('group', 'owner')).toBe(true);
    expect(canDeleteConversation('group', 'admin')).toBe(false);
  });

  it('личный диалог не удаляется этой кнопкой', () => {
    expect(canDeleteConversation('direct', 'owner')).toBe(false);
  });
});

describe('canRemoveMember', () => {
  const base = { kind: 'group', myRole: 'owner', targetRole: 'member', isMe: false } as const;

  it('владелец исключает и участника, и администратора', () => {
    expect(canRemoveMember({ ...base })).toBe(true);
    expect(canRemoveMember({ ...base, targetRole: 'admin' })).toBe(true);
  });

  it('администратор исключает только рядовых', () => {
    expect(canRemoveMember({ ...base, myRole: 'admin' })).toBe(true);
    expect(canRemoveMember({ ...base, myRole: 'admin', targetRole: 'admin' })).toBe(false);
  });

  it('владельца не исключает никто', () => {
    expect(canRemoveMember({ ...base, targetRole: 'owner' })).toBe(false);
  });

  it('себя из списка не исключают — для этого «Выйти»', () => {
    expect(canRemoveMember({ ...base, isMe: true })).toBe(false);
  });

  it('рядовой участник не исключает никого', () => {
    expect(canRemoveMember({ ...base, myRole: 'member' })).toBe(false);
  });
});

describe('canSetRole', () => {
  it('права раздаёт только владелец', () => {
    expect(canSetRole('owner', 'member')).toBe(true);
    expect(canSetRole('admin', 'member')).toBe(false);
  });

  it('роль владельца не переключается', () => {
    expect(canSetRole('owner', 'owner')).toBe(false);
  });
});

describe('nextRoleAction', () => {
  it('у рядового — «Сделать админом», у админа — «Снять права»', () => {
    expect(nextRoleAction('member')).toEqual({ role: 'admin', label: 'Сделать админом' });
    expect(nextRoleAction('admin')).toEqual({ role: 'member', label: 'Снять права' });
  });
});

describe('leaveLabel', () => {
  it('из канала отписываются, из группы выходят', () => {
    expect(leaveLabel('channel')).toBe('Отписаться');
    expect(leaveLabel('group')).toBe('Выйти из группы');
  });
});

describe('inviteCandidates', () => {
  const people: ChatUserSummary[] = [
    { id: 'u1', name: 'Радха' },
    { id: 'u2', name: 'Мадхава' },
  ];

  it('убирает тех, кто уже в беседе', () => {
    expect(inviteCandidates(people, ['u1']).map((p) => p.id)).toEqual(['u2']);
  });

  it('все уже внутри — звать некого', () => {
    expect(inviteCandidates(people, ['u1', 'u2'])).toEqual([]);
  });

  it('пустой список участников оставляет всех', () => {
    expect(inviteCandidates(people, [])).toHaveLength(2);
  });
});
