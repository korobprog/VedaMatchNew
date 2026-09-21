import type { ChatConversationKind, ChatMemberRole, ChatUserSummary } from '@vedamatch/shared';

/**
 * Права в групповой беседе — копия серверных правил из
 * `apps/api/src/modules/chat/chat-access.ts`. Копия, а не импорт: контракт
 * сервисного модуля запрещает мобильному приложению тянуть код сервера, и
 * такие же копии уже живут на сайте (`chat-members-view.tsx`).
 *
 * Клиент решает только, что показывать. Отказ всё равно приходит с сервера,
 * поэтому расхождение в копии — это лишняя кнопка, а не дыра в правах.
 */
export const CHAT_MEMBER_ROLE_LABELS: Record<ChatMemberRole, string> = {
  owner: 'Владелец',
  admin: 'Администратор',
  member: 'Участник',
};

const MANAGING_ROLES: ChatMemberRole[] = ['owner', 'admin'];

function manages(kind: ChatConversationKind, myRole: ChatMemberRole): boolean {
  return kind !== 'direct' && MANAGING_ROLES.includes(myRole);
}

/** Звать в беседу вправе владелец и администратор; в личный диалог — никто. */
export function canInvite(kind: ChatConversationKind, myRole: ChatMemberRole): boolean {
  return manages(kind, myRole);
}

/** Название, описание и открытость меняет владелец или администратор. */
export function canEditConversation(kind: ChatConversationKind, myRole: ChatMemberRole): boolean {
  return manages(kind, myRole);
}

/** Удалить беседу со всей перепиской может только владелец. */
export function canDeleteConversation(kind: ChatConversationKind, myRole: ChatMemberRole): boolean {
  return kind !== 'direct' && myRole === 'owner';
}

export interface RemoveMemberContext {
  kind: ChatConversationKind;
  myRole: ChatMemberRole;
  targetRole: ChatMemberRole;
  /** Себя из списка не исключают — для этого есть «Выйти». */
  isMe: boolean;
}

/**
 * Владельца не трогает никто, себя — через «Выйти», а администратора
 * исключает только владелец.
 */
export function canRemoveMember({ kind, myRole, targetRole, isMe }: RemoveMemberContext): boolean {
  if (!manages(kind, myRole)) return false;
  if (isMe || targetRole === 'owner') return false;
  return myRole === 'owner' || targetRole === 'member';
}

/** Права раздаёт только владелец, и не самому себе. */
export function canSetRole(myRole: ChatMemberRole, targetRole: ChatMemberRole): boolean {
  return myRole === 'owner' && targetRole !== 'owner';
}

/** Что произойдёт по нажатию на переключатель прав у этого участника. */
export function nextRoleAction(targetRole: ChatMemberRole): { role: 'admin' | 'member'; label: string } {
  return targetRole === 'admin'
    ? { role: 'member', label: 'Снять права' }
    : { role: 'admin', label: 'Сделать админом' };
}

/** Уйти из канала — «отписаться», из группы — «выйти». */
export function leaveLabel(kind: ChatConversationKind): string {
  return kind === 'channel' ? 'Отписаться' : 'Выйти из группы';
}

/** Кого ещё можно позвать: те, с кем уже есть переписка и кого тут ещё нет. */
export function inviteCandidates(
  people: readonly ChatUserSummary[],
  memberIds: readonly string[],
): ChatUserSummary[] {
  const inside = new Set(memberIds);
  return people.filter((person) => !inside.has(person.id));
}
