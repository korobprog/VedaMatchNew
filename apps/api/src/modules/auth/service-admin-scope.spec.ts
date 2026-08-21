import { canAdminService, isPortalAdmin } from '@vedamatch/shared';
import type { AccessTokenPayload } from '@vedamatch/shared';

const payload = (
  role: AccessTokenPayload['role'],
  adminServices?: string[],
): AccessTokenPayload => ({
  sub: 'u-1',
  email: 'u@example.com',
  role,
  adminServices,
});

describe('права администратора сервиса', () => {
  it('admin управляет любым сервисом без списка', () => {
    expect(canAdminService(payload('admin'), 'market')).toBe(true);
    expect(canAdminService(payload('admin'), 'union')).toBe(true);
  });

  it('service-admin управляет только выданными сервисами', () => {
    const user = payload('service-admin', ['market', 'notices']);
    expect(canAdminService(user, 'market')).toBe(true);
    expect(canAdminService(user, 'notices')).toBe(true);
    expect(canAdminService(user, 'motivation')).toBe(false);
  });

  it('service-admin без списка прав не имеет: токен без adminServices не даёт доступа', () => {
    expect(canAdminService(payload('service-admin'), 'market')).toBe(false);
    expect(canAdminService(payload('service-admin', []), 'market')).toBe(false);
  });

  it('обычный пользователь не проходит даже со списком сервисов', () => {
    expect(canAdminService(payload('user', ['market']), 'market')).toBe(false);
  });

  it('isPortalAdmin пускает обе админские роли и никого больше', () => {
    expect(isPortalAdmin(payload('admin'))).toBe(true);
    expect(isPortalAdmin(payload('service-admin'))).toBe(true);
    expect(isPortalAdmin(payload('user'))).toBe(false);
  });
});
