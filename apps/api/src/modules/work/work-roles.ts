import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { WorkMemberRole } from '@vedamatch/shared';

/**
 * Права в рабочей среде. Четыре роли и закрытый список действий — вместо
 * конструктора процессов, за который ругают тяжёлые трекеры.
 *
 * Проверка отделена от базы намеренно: «кто что может» — это правило продукта,
 * и оно должно читаться одним экраном и проверяться тестом, а не собираться по
 * десяти `if (role === 'admin')` в сервисах.
 */
export type WorkAction =
  /** Смотреть доски, карточки и обсуждение. */
  | 'view'
  /** Создавать, править, двигать и архивировать задачи; комментировать. */
  | 'editTask'
  /** Заводить и переименовывать доски, колонки и метки. */
  | 'manageBoard'
  /** Приглашать, менять роли, исключать. */
  | 'manageMembers'
  /** Переименовать среду. */
  | 'editSpace'
  /** Удалить среду или передать владение. */
  | 'deleteSpace';

const RANK: Record<WorkMemberRole, number> = {
  viewer: 0,
  member: 1,
  admin: 2,
  owner: 3,
};

/** Минимальная роль для действия. */
const REQUIRED: Record<WorkAction, WorkMemberRole> = {
  view: 'viewer',
  editTask: 'member',
  manageBoard: 'admin',
  manageMembers: 'admin',
  editSpace: 'admin',
  deleteSpace: 'owner',
};

export function canWork(role: WorkMemberRole, action: WorkAction): boolean {
  return RANK[role] >= RANK[REQUIRED[action]];
}

/**
 * Чужая среда неотличима от несуществующей: 404, а не 403.
 *
 * 403 подтверждает, что среда с таким id есть, — по подобранным идентификаторам
 * можно пересчитать чужие проекты. Отказ в действии внутри своей среды — уже
 * 403: человек знает, что среда есть, вопрос только в правах.
 */
export function assertWorkAccess(
  role: WorkMemberRole | null | undefined,
  action: WorkAction,
): asserts role is WorkMemberRole {
  if (!role) throw new NotFoundException('Рабочая среда не найдена');
  if (!canWork(role, action)) {
    throw new ForbiddenException('Недостаточно прав в этой рабочей среде');
  }
}

/**
 * Может ли `actor` назначить участнику роль `target`.
 *
 * Своя роль — потолок: администратор не производит второго владельца, иначе
 * владение размножается в обход единственной законной передачи. Себя понижать
 * можно, а вот владелец без передачи владения не уходит — это проверяется
 * отдельно, там, где известен состав среды.
 */
export function canAssignRole(
  actor: WorkMemberRole,
  target: WorkMemberRole,
): boolean {
  if (!canWork(actor, 'manageMembers')) return false;
  return (
    RANK[target] < RANK[actor] || (actor === 'owner' && target !== 'owner')
  );
}

/** Читаемое имя роли — для писем, уведомлений и экрана приглашения. */
export function workRoleTitle(role: WorkMemberRole): string {
  switch (role) {
    case 'owner':
      return 'владелец';
    case 'admin':
      return 'администратор';
    case 'member':
      return 'участник';
    case 'viewer':
      return 'наблюдатель';
  }
}
