import type { ChatMemberDto, ChatMemberRole } from '@vedamatch/shared';
import {
  describeMemberAction,
  memberIdsOf,
  sortMembers,
  withoutMember,
  withRole,
} from './members-state';

function member(id: string, name: string, role: ChatMemberRole = 'member'): ChatMemberDto {
  return { user: { id, name }, role, joinedAt: '2026-01-01T00:00:00.000Z' };
}

describe('sortMembers', () => {
  it('владелец первый, администраторы следом, остальные в конце', () => {
    const sorted = sortMembers([member('u3', 'Ананда'), member('u1', 'Радха', 'owner'), member('u2', 'Мадхава', 'admin')]);
    expect(sorted.map((m) => m.user.id)).toEqual(['u1', 'u2', 'u3']);
  });

  it('внутри одной роли — по алфавиту', () => {
    const sorted = sortMembers([member('u2', 'Ямуна'), member('u1', 'Ананда')]);
    expect(sorted.map((m) => m.user.id)).toEqual(['u1', 'u2']);
  });

  it('исходный список не меняется', () => {
    const members = [member('u2', 'Ямуна'), member('u1', 'Ананда')];
    sortMembers(members);
    expect(members.map((m) => m.user.id)).toEqual(['u2', 'u1']);
  });
});

describe('withoutMember', () => {
  it('убирает исключённого и оставляет остальных', () => {
    expect(memberIdsOf(withoutMember([member('u1', 'А'), member('u2', 'Б')], 'u1'))).toEqual(['u2']);
  });

  it('незнакомый id ничего не ломает', () => {
    expect(withoutMember([member('u1', 'А')], 'u9')).toHaveLength(1);
  });
});

describe('withRole', () => {
  it('меняет роль нужному участнику', () => {
    const next = withRole([member('u1', 'А'), member('u2', 'Б')], 'u2', 'admin');
    expect(next.find((m) => m.user.id === 'u2')?.role).toBe('admin');
  });

  it('чужие строки не трогает', () => {
    const next = withRole([member('u1', 'А'), member('u2', 'Б')], 'u2', 'admin');
    expect(next.find((m) => m.user.id === 'u1')?.role).toBe('member');
  });
});

describe('describeMemberAction', () => {
  it('исключение называет человека по имени', () => {
    const text = describeMemberAction({ kind: 'remove', userId: 'u1', name: 'Мадхава' }, 'group');
    expect(text.message).toContain('Мадхава');
    expect(text.confirmLabel).toBe('Исключить');
  });

  it('уход из канала — «Отписаться», из группы — «Выйти»', () => {
    expect(describeMemberAction({ kind: 'leave' }, 'channel').confirmLabel).toBe('Отписаться');
    expect(describeMemberAction({ kind: 'leave' }, 'group').confirmLabel).toBe('Выйти');
  });

  it('удаление беседы честно предупреждает, что вернуть нельзя', () => {
    const text = describeMemberAction({ kind: 'delete' }, 'group');
    expect(text.message).toContain('Вернуть будет нельзя');
    expect(text.confirmLabel).toBe('Удалить');
  });
});
