import type { ChatConversationKind, ChatMemberDto, ChatMemberRole } from '@vedamatch/shared';

/**
 * Список участников беседы между ответами сервера. После исключения или
 * смены роли перечитывать всю беседу незачем: строка правится на месте, а
 * ошибка всё равно придёт из ручки и откатит экран перезагрузкой.
 */
const ROLE_WEIGHT: Record<ChatMemberRole, number> = { owner: 0, admin: 1, member: 2 };

/** Владелец, затем администраторы, затем остальные — внутри по алфавиту. */
export function sortMembers(members: readonly ChatMemberDto[]): ChatMemberDto[] {
  return [...members].sort((a, b) => {
    const byRole = ROLE_WEIGHT[a.role] - ROLE_WEIGHT[b.role];
    if (byRole !== 0) return byRole;
    return a.user.name.localeCompare(b.user.name, 'ru');
  });
}

export function withoutMember(members: readonly ChatMemberDto[], userId: string): ChatMemberDto[] {
  return members.filter((member) => member.user.id !== userId);
}

export function withRole(
  members: readonly ChatMemberDto[],
  userId: string,
  role: ChatMemberRole,
): ChatMemberDto[] {
  return members.map((member) => (member.user.id === userId ? { ...member, role } : member));
}

export function memberIdsOf(members: readonly ChatMemberDto[]): string[] {
  return members.map((member) => member.user.id);
}

export type PendingMemberAction =
  | { kind: 'remove'; userId: string; name: string }
  | { kind: 'leave' }
  | { kind: 'delete' };

export interface ConfirmText {
  title: string;
  message: string;
  confirmLabel: string;
}

/** Текст подтверждения опасного действия: своя формулировка на каждое. */
export function describeMemberAction(
  action: PendingMemberAction,
  conversationKind: ChatConversationKind,
): ConfirmText {
  if (action.kind === 'remove') {
    return {
      title: 'Исключить из беседы',
      message: `${action.name} больше не увидит переписку. Позвать обратно можно в любой момент.`,
      confirmLabel: 'Исключить',
    };
  }
  if (action.kind === 'leave') {
    return conversationKind === 'channel'
      ? {
          title: 'Отписаться от канала',
          message: 'Новые записи перестанут приходить. Вернуться можно через каталог общины.',
          confirmLabel: 'Отписаться',
        }
      : {
          title: 'Выйти из группы',
          message: 'Переписка пропадёт из списка. Вернуться можно, только если позовут снова.',
          confirmLabel: 'Выйти',
        };
  }
  return {
    title: 'Удалить беседу',
    message: 'Беседа исчезнет вместе со всей перепиской у всех участников. Вернуть будет нельзя.',
    confirmLabel: 'Удалить',
  };
}
