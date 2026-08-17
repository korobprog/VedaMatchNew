import {
  REAPPLY_COOLDOWN_DAYS,
  canAssignRole,
  canModerateCommunityContent,
  canManageCommunity,
  canPostAsCommunity,
  canReapply,
  isListed,
  isOwner,
  isReachable,
  joinStatusFor,
  type MembershipLike,
} from './community-roles';

const member = (
  role: MembershipLike['role'],
  status: MembershipLike['status'] = 'active',
): MembershipLike => ({ role, status });

describe('права внутри общины', () => {
  it('управлять могут владелец и админ, но только с активным членством', () => {
    expect(canManageCommunity(member('owner'))).toBe(true);
    expect(canManageCommunity(member('admin'))).toBe(true);
    expect(canManageCommunity(member('moderator'))).toBe(false);
    expect(canManageCommunity(member('member'))).toBe(false);
    expect(canManageCommunity(member('admin', 'pending'))).toBe(false);
    expect(canManageCommunity(member('owner', 'removed'))).toBe(false);
    expect(canManageCommunity(null)).toBe(false);
  });

  it('публикация от имени общины совпадает с управлением', () => {
    for (const role of ['owner', 'admin', 'moderator', 'member'] as const) {
      expect(canPostAsCommunity(member(role))).toBe(
        canManageCommunity(member(role)),
      );
    }
  });

  it('модерация шире управления ровно на moderator', () => {
    expect(canModerateCommunityContent(member('moderator'))).toBe(true);
    expect(canModerateCommunityContent(member('admin'))).toBe(true);
    expect(canModerateCommunityContent(member('member'))).toBe(false);
    // Но управлять общиной модератор по-прежнему не может.
    expect(canManageCommunity(member('moderator'))).toBe(false);
  });

  it('владельцем считается только активный owner', () => {
    expect(isOwner(member('owner'))).toBe(true);
    expect(isOwner(member('owner', 'left'))).toBe(false);
    expect(isOwner(member('admin'))).toBe(false);
  });
});

describe('canAssignRole', () => {
  it('владельца через смену роли не выдают — только принятой передачей', () => {
    expect(canAssignRole(member('owner'), member('member'), 'owner')).toBe(
      false,
    );
  });

  it('владельца не понижает никто, включая его самого', () => {
    expect(canAssignRole(member('owner'), member('owner'), 'admin')).toBe(
      false,
    );
  });

  it('владелец назначает админов и модераторов', () => {
    expect(canAssignRole(member('owner'), member('member'), 'admin')).toBe(
      true,
    );
    expect(canAssignRole(member('owner'), member('admin'), 'member')).toBe(
      true,
    );
  });

  it('админ ведёт рядовых и модераторов, но не других админов', () => {
    expect(canAssignRole(member('admin'), member('member'), 'moderator')).toBe(
      true,
    );
    // Иначе двое админов снимут друг друга наперегонки.
    expect(canAssignRole(member('admin'), member('admin'), 'member')).toBe(
      false,
    );
    expect(canAssignRole(member('admin'), member('member'), 'admin')).toBe(
      false,
    );
  });

  it('модератор и рядовой не назначают никого', () => {
    expect(canAssignRole(member('moderator'), member('member'), 'admin')).toBe(
      false,
    );
    expect(canAssignRole(member('member'), member('member'), 'moderator')).toBe(
      false,
    );
    expect(canAssignRole(null, member('member'), 'moderator')).toBe(false);
  });
});

describe('joinStatusFor', () => {
  it('открытая община принимает сразу, закрытая — через заявку', () => {
    expect(joinStatusFor('open')).toBe('active');
    expect(joinStatusFor('request_approval')).toBe('pending');
  });

  it('в invite_only заявку подать нельзя вовсе', () => {
    expect(joinStatusFor('invite_only')).toBeNull();
  });
});

describe('видимость общины', () => {
  it('в справочник попадает только active', () => {
    expect(isListed('active')).toBe(true);
    for (const status of [
      'draft',
      'pending',
      'paused',
      'archived',
      'hidden_by_reports',
      'removed_by_admin',
    ] as const) {
      expect(isListed(status)).toBe(false);
    }
  });

  it('на паузе община не ищется, но по ссылке открывается', () => {
    // Ссылки из старых объявлений и переписок не должны отдавать 404.
    expect(isListed('paused')).toBe(false);
    expect(isReachable('paused')).toBe(true);
    expect(isReachable('archived')).toBe(false);
    expect(isReachable('pending')).toBe(false);
  });
});

describe('canReapply', () => {
  const now = new Date('2026-08-17T12:00:00.000Z');
  const daysAgo = (days: number) =>
    new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

  it('без прошлого членства заявка свободна', () => {
    expect(canReapply(null, now)).toBe(true);
  });

  it('уже состоящий и уже подавший заявку повторно не подаёт', () => {
    expect(canReapply({ status: 'active', decidedAt: null }, now)).toBe(false);
    expect(canReapply({ status: 'pending', decidedAt: null }, now)).toBe(false);
  });

  it('ушедший сам возвращается без ожидания', () => {
    expect(canReapply({ status: 'left', decidedAt: daysAgo(1) }, now)).toBe(
      true,
    );
  });

  it('исключённого возвращает только приглашение, срок не помогает', () => {
    expect(
      canReapply({ status: 'removed', decidedAt: daysAgo(3650) }, now),
    ).toBe(false);
  });

  it('после отказа заявка остывает', () => {
    expect(
      canReapply(
        { status: 'declined', decidedAt: daysAgo(REAPPLY_COOLDOWN_DAYS - 1) },
        now,
      ),
    ).toBe(false);
    expect(
      canReapply(
        { status: 'declined', decidedAt: daysAgo(REAPPLY_COOLDOWN_DAYS) },
        now,
      ),
    ).toBe(true);
  });
});
