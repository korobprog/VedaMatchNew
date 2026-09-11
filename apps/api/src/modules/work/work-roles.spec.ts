import { ForbiddenException, NotFoundException } from '@nestjs/common';
import {
  assertWorkAccess,
  canAssignRole,
  canWork,
  workRoleTitle,
} from './work-roles';

describe('canWork', () => {
  it('наблюдатель только смотрит', () => {
    expect(canWork('viewer', 'view')).toBe(true);
    expect(canWork('viewer', 'editTask')).toBe(false);
  });

  it('участник ведёт задачи, но не заводит доски', () => {
    expect(canWork('member', 'editTask')).toBe(true);
    expect(canWork('member', 'manageBoard')).toBe(false);
    expect(canWork('member', 'manageMembers')).toBe(false);
  });

  // Участник ошибается в своей карточке, а стирает обсуждение целиком тот,
  // кто отвечает за среду: участнику остаётся архив, откуда карточку вернут.
  it('стереть задачу насовсем участник не может', () => {
    expect(canWork('member', 'deleteTask')).toBe(false);
    expect(canWork('admin', 'deleteTask')).toBe(true);
  });

  it('администратор заводит доски и приглашает', () => {
    expect(canWork('admin', 'manageBoard')).toBe(true);
    expect(canWork('admin', 'manageMembers')).toBe(true);
  });

  it('удалить среду может только владелец', () => {
    expect(canWork('admin', 'deleteSpace')).toBe(false);
    expect(canWork('owner', 'deleteSpace')).toBe(true);
  });
});

describe('assertWorkAccess', () => {
  it('чужая среда неотличима от несуществующей', () => {
    expect(() => assertWorkAccess(null, 'view')).toThrow(NotFoundException);
  });

  it('нехватка прав внутри своей среды — 403', () => {
    expect(() => assertWorkAccess('viewer', 'editTask')).toThrow(
      ForbiddenException,
    );
  });

  it('своей роли хватило — молчит', () => {
    expect(() => assertWorkAccess('member', 'editTask')).not.toThrow();
  });
});

describe('canAssignRole', () => {
  it('участник ролей не раздаёт', () => {
    expect(canAssignRole('member', 'viewer')).toBe(false);
  });

  it('администратор не производит второго администратора выше себя', () => {
    expect(canAssignRole('admin', 'member')).toBe(true);
    expect(canAssignRole('admin', 'admin')).toBe(false);
    expect(canAssignRole('admin', 'owner')).toBe(false);
  });

  it('владелец назначает кого угодно, кроме второго владельца', () => {
    expect(canAssignRole('owner', 'admin')).toBe(true);
    expect(canAssignRole('owner', 'owner')).toBe(false);
  });
});

describe('workRoleTitle', () => {
  it('называет роли по-русски', () => {
    expect(workRoleTitle('owner')).toBe('владелец');
    expect(workRoleTitle('viewer')).toBe('наблюдатель');
  });
});
