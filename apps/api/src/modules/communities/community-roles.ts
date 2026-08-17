import type {
  CommunityJoinPolicy,
  CommunityMemberRole,
  CommunityMemberStatus,
  CommunityStatus,
} from '@vedamatch/shared';

/**
 * Права внутри общины — чистые функции без Prisma, чтобы правила доступа
 * проверялись тестами напрямую, а не через мок выдачи. Тот же приём, что у
 * market-listing-validate.ts.
 */

/** Всё, что нужно знать о членстве, чтобы решить вопрос о правах. */
export interface MembershipLike {
  role: CommunityMemberRole;
  status: CommunityMemberStatus;
}

/** Роли, дающие право говорить и действовать от имени общины. */
const MANAGING_ROLES: CommunityMemberRole[] = ['owner', 'admin'];

export function isActiveMember(
  membership: MembershipLike | null | undefined,
): boolean {
  return membership?.status === 'active';
}

/** Править карточку, разбирать заявки, назначать роли. */
export function canManageCommunity(
  membership: MembershipLike | null | undefined,
): boolean {
  return (
    isActiveMember(membership) && MANAGING_ROLES.includes(membership!.role)
  );
}

/**
 * Публиковать объявления от имени общины. Совпадает с управлением намеренно:
 * право говорить от имени ятры — это и есть управление её лицом, а отдельная
 * роль «пресс-секретарь» без запроса от людей была бы выдумкой.
 */
export function canPostAsCommunity(
  membership: MembershipLike | null | undefined,
): boolean {
  return canManageCommunity(membership);
}

/**
 * Скрыть чужое объявление, привязанное к общине. Шире управления: сюда
 * добавляется `moderator` — делегирование модерации существует ровно ради
 * того, чтобы разбор жалоб не упирался в портальную администрацию.
 */
export function canModerateCommunityContent(
  membership: MembershipLike | null | undefined,
): boolean {
  return (
    isActiveMember(membership) &&
    (MANAGING_ROLES.includes(membership!.role) ||
      membership!.role === 'moderator')
  );
}

/** Передать владение и распустить общину может только владелец. */
export function isOwner(
  membership: MembershipLike | null | undefined,
): boolean {
  return isActiveMember(membership) && membership!.role === 'owner';
}

/**
 * Может ли `actor` назначить участнику роль `nextRole`.
 *
 * Владельца через смену роли не выдают: владелец меняется только принятой
 * передачей (`CommunityOwnershipTransfer`), иначе ответственность за общину
 * можно было бы навесить на человека молча.
 */
export function canAssignRole(
  actor: MembershipLike | null | undefined,
  target: MembershipLike,
  nextRole: CommunityMemberRole,
): boolean {
  if (nextRole === 'owner') return false;
  // Владельца никто не понижает, включая его самого: община без владельца
  // осталась бы без единственной роли, которая может её восстановить.
  if (target.role === 'owner') return false;
  if (isOwner(actor)) return true;
  // Админ ведёт рядовых участников и модераторов, но не других админов:
  // иначе двое админов могут снять друг друга наперегонки.
  if (!canManageCommunity(actor)) return false;
  return target.role !== 'admin' && nextRole !== 'admin';
}

/** Статус, который получает вступающий при данной политике общины. */
export function joinStatusFor(
  policy: CommunityJoinPolicy,
): CommunityMemberStatus | null {
  if (policy === 'open') return 'active';
  if (policy === 'request_approval') return 'pending';
  // invite_only — заявку подать нельзя вовсе, только принять приглашение.
  return null;
}

/** Община попадает в справочник и на карту. */
export function isListed(status: CommunityStatus): boolean {
  return status === 'active';
}

/**
 * Община открывается по прямой ссылке. `paused` шире, чем `isListed`:
 * община на паузе не ищется, но её ссылки из старых объявлений и переписок
 * не должны отдавать 404.
 */
export function isReachable(status: CommunityStatus): boolean {
  return status === 'active' || status === 'paused';
}

/**
 * Сколько дней после отказа нельзя подать заявку снова. Без паузы отказ
 * ничего не значит: заявку переотправят в тот же вечер.
 */
export const REAPPLY_COOLDOWN_DAYS = 30;

/**
 * Можно ли подать заявку снова, зная прошлое членство.
 *
 * `removed` не остывает никогда: исключённого возвращает только приглашение.
 * `left` не блокирует ничего — ушедший вправе вернуться сам.
 */
export function canReapply(
  previous: { status: CommunityMemberStatus; decidedAt: Date | null } | null,
  now: Date,
): boolean {
  if (!previous) return true;
  if (previous.status === 'active' || previous.status === 'pending')
    return false;
  if (previous.status === 'removed') return false;
  if (previous.status === 'left') return true;
  // declined — ждём, пока остынет.
  if (!previous.decidedAt) return true;
  const passedMs = now.getTime() - previous.decidedAt.getTime();
  return passedMs >= REAPPLY_COOLDOWN_DAYS * 24 * 60 * 60 * 1000;
}
