import { isMotivationAdminRow } from './author-admin';

const scopes = (...slugs: string[]) =>
  slugs.map((slug) => ({ service: { slug } }));

describe('isMotivationAdminRow', () => {
  it('портальный администратор — администратор любого сервиса', () => {
    expect(isMotivationAdminRow({ role: 'admin', serviceAdminScopes: [] })).toBe(
      true,
    );
  });

  it('администратор сервиса — только со своим слагом', () => {
    expect(
      isMotivationAdminRow({
        role: 'service_admin',
        serviceAdminScopes: scopes('motivation'),
      }),
    ).toBe(true);
    expect(
      isMotivationAdminRow({
        role: 'service_admin',
        serviceAdminScopes: scopes('market', 'union'),
      }),
    ).toBe(false);
  });

  it('администратор сервиса без прав вообще ничего не решает', () => {
    expect(
      isMotivationAdminRow({ role: 'service_admin', serviceAdminScopes: [] }),
    ).toBe(false);
  });

  it('обычный участник не администратор, даже со списком сервисов', () => {
    // Список без роли ничего не значит: права даёт роль, а не запись.
    expect(
      isMotivationAdminRow({
        role: 'user',
        serviceAdminScopes: scopes('motivation'),
      }),
    ).toBe(false);
  });

  it('без автора решать нечего: пост нашёл конвейер', () => {
    expect(isMotivationAdminRow(null)).toBe(false);
    expect(isMotivationAdminRow(undefined)).toBe(false);
  });
});
