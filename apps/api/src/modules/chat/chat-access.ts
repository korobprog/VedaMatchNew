import type {
  ChatConversationKind,
  ChatConversationState,
  ChatConversationVisibility,
  ChatMemberRole,
} from '@vedamatch/shared';

/**
 * Кто и что может в беседе. Отдельным модулем, а не ветками внутри сервиса:
 * правил много, они разные для трёх видов бесед, и ошибка здесь означает
 * либо чужую переписку наружу, либо спам в канал общины.
 */

export interface ConversationAccessInput {
  kind: ChatConversationKind;
  state: ChatConversationState;
  /** Открытая беседа пускает к себе сама, закрытая — только по приглашению. */
  visibility?: ChatConversationVisibility;
  /**
   * Пишем комментарий к посту канала, а не пост. Читателям канала это
   * разрешено: запрет на запись охраняет ленту, а не обсуждение под ней.
   */
  isComment?: boolean;
  /** Кто отправил запрос: пока он не принят, писать может только этот человек. */
  requestedById?: string | null;
  /** Сколько сообщений уже в беседе — запрос даёт ровно одно. */
  messageCount?: number;
  /**
   * Блокировка между собеседниками личного диалога — в любую сторону.
   *
   * Проверять её только при заведении диалога недостаточно: блокируют чаще
   * всего посреди переписки, а диалог к этому времени уже есть, и без этого
   * флага заблокированный продолжал писать в него как ни в чём не бывало.
   */
  blocked?: boolean;
}

export interface MemberAccessInput {
  userId: string;
  role: ChatMemberRole;
  /** Вышел из группы или удалил диалог. */
  leftAt?: Date | string | null;
}

export type WriteDenial =
  | 'not_member'
  | 'left'
  | 'blocked'
  | 'declined'
  | 'archived'
  | 'request_awaiting_answer'
  | 'request_not_yours'
  | 'channel_readers_do_not_write';

/**
 * Право читать: участие в беседе. Вышедший из группы продолжает видеть
 * то, что было при нём, — переписка не исчезает задним числом.
 */
export function canRead(member: MemberAccessInput | null | undefined): boolean {
  return Boolean(member);
}

/**
 * Право писать. Возвращает причину отказа, а не просто `false`: контроллеру
 * нужно объяснить человеку, почему поле ввода закрыто.
 */
export function denyWrite(
  conversation: ConversationAccessInput,
  member: MemberAccessInput | null | undefined,
): WriteDenial | null {
  if (!member) return 'not_member';
  if (member.leftAt) return 'left';
  // Раньше состояния беседы: заблокированному незачем знать, приняли его
  // запрос или отклонили, — ответ одинаковый в любом случае.
  if (conversation.blocked) return 'blocked';
  if (conversation.state === 'declined') return 'declined';
  if (conversation.state === 'archived') return 'archived';

  if (conversation.state === 'request') {
    // Запрос: пишет только его автор и только один раз. Получатель молчит,
    // пока не примет, — иначе «принять» теряет смысл.
    if (conversation.requestedById !== member.userId)
      return 'request_not_yours';
    if ((conversation.messageCount ?? 0) >= 1) return 'request_awaiting_answer';
    return null;
  }

  if (
    conversation.kind === 'channel' &&
    member.role === 'member' &&
    !conversation.isComment
  )
    return 'channel_readers_do_not_write';

  return null;
}

export function canWrite(
  conversation: ConversationAccessInput,
  member: MemberAccessInput | null | undefined,
): boolean {
  return denyWrite(conversation, member) === null;
}

/** Звать людей в группу и канал может только владелец или администратор. */
export function canInvite(
  conversation: ConversationAccessInput,
  member: MemberAccessInput | null | undefined,
): boolean {
  if (!member || member.leftAt) return false;
  if (conversation.kind === 'direct') return false;
  return member.role === 'owner' || member.role === 'admin';
}

export type JoinDenial = 'direct_is_not_public' | 'private' | 'not_active';

/**
 * Войти в беседу самому. Личный диалог не «открывают»: он всегда на двоих,
 * и третьему там места нет ни при какой настройке.
 */
export function denyJoin(
  conversation: ConversationAccessInput,
): JoinDenial | null {
  if (conversation.kind === 'direct') return 'direct_is_not_public';
  if (conversation.state !== 'active') return 'not_active';
  if (conversation.visibility !== 'public') return 'private';
  return null;
}

export type MemberDenial =
  | 'not_allowed'
  | 'direct_has_no_roles'
  | 'owner_is_untouchable'
  | 'owner_sets_roles';

/**
 * Убрать человека из беседы. Владельца не убирает никто — беседа без
 * владельца остаётся без того, кто может назначить нового; себя убирают
 * не отсюда, а выходом из беседы.
 */
export function denyRemoveMember(
  conversation: ConversationAccessInput,
  actor: MemberAccessInput | null | undefined,
  target: MemberAccessInput,
): MemberDenial | null {
  if (conversation.kind === 'direct') return 'direct_has_no_roles';
  if (!actor || actor.leftAt) return 'not_allowed';
  if (actor.role !== 'owner' && actor.role !== 'admin') return 'not_allowed';
  if (target.role === 'owner') return 'owner_is_untouchable';
  // Администратор равен администратору: снимать друг друга они не должны,
  // иначе двое с правами превращают беседу в перетягивание каната.
  if (target.role === 'admin' && actor.role !== 'owner') return 'not_allowed';
  return null;
}

/** Раздаёт и снимает права только владелец. */
export function denySetRole(
  conversation: ConversationAccessInput,
  actor: MemberAccessInput | null | undefined,
  target: MemberAccessInput,
): MemberDenial | null {
  if (conversation.kind === 'direct') return 'direct_has_no_roles';
  if (!actor || actor.leftAt) return 'not_allowed';
  if (actor.role !== 'owner') return 'owner_sets_roles';
  if (target.role === 'owner') return 'owner_is_untouchable';
  return null;
}

/**
 * Закрепить сообщение. В личном диалоге это делает любой из двоих: там нет
 * старших. В группе и канале — владелец и администратор, иначе закреплённое
 * будет переписываться каждым, кто счёл своё сообщение важным.
 */
/**
 * Удалить беседу целиком может только её владелец и только группу или канал.
 *
 * Личный диалог не удаляется ни одной из сторон: у него два хозяина, и
 * стереть общую переписку по желанию одного — значит стереть её и у второго.
 * Оттуда выходят (`leave`), а не удаляют.
 */
export function canDeleteConversation(
  conversation: ConversationAccessInput,
  member: MemberAccessInput | null | undefined,
): boolean {
  if (conversation.kind === 'direct') return false;
  if (!member || member.leftAt) return false;
  return member.role === 'owner';
}

export function canPinMessage(
  conversation: ConversationAccessInput,
  member: MemberAccessInput | null | undefined,
): boolean {
  if (!member || member.leftAt) return false;
  if (conversation.kind === 'direct') return true;
  return member.role === 'owner' || member.role === 'admin';
}

/**
 * Править и удалять можно только своё сообщение. Удалять чужое в группе и
 * канале имеет право владелец: без этого модерация общины упирается в админку
 * портала по каждому пустяку.
 */
export function canEditMessage(
  authorId: string,
  member: MemberAccessInput | null | undefined,
): boolean {
  return Boolean(member && !member.leftAt && member.userId === authorId);
}

export function canDeleteMessage(
  authorId: string,
  conversation: ConversationAccessInput,
  member: MemberAccessInput | null | undefined,
): boolean {
  if (!member || member.leftAt) return false;
  if (member.userId === authorId) return true;
  if (conversation.kind === 'direct') return false;
  return member.role === 'owner' || member.role === 'admin';
}
