import { ForbiddenException } from '@nestjs/common';
import { AuthProvidersService, portalHost } from './auth-providers.service';

const rows = [
  { provider: 'google', enabled: true, domains: ['vedamatch.ru'], sortOrder: 0 },
  { provider: 'yandex', enabled: false, domains: ['vedamatch.ru'], sortOrder: 1 },
];

function service() {
  const prisma = {
    authProviderSetting: { findMany: jest.fn().mockResolvedValue(rows) },
  } as never;
  return new AuthProvidersService(prisma);
}

describe('portalHost', () => {
  it('сводит хост API к хосту портала', () => {
    // В проде API живёт на api.vedamatch.ru, а настройки пишутся в терминах
    // портала. Без этого список способов в проде оказался бы пустым.
    expect(portalHost('api.vedamatch.ru')).toBe('vedamatch.ru');
  });

  it('отбрасывает порт и регистр', () => {
    expect(portalHost('LOCALHOST:4000')).toBe('localhost');
  });

  it('чужой хост не трогает', () => {
    expect(portalHost('vedamatch.ru')).toBe('vedamatch.ru');
    expect(portalHost('apiary.example.com')).toBe('apiary.example.com');
  });
});

describe('AuthProvidersService', () => {
  it('отдаёт только включённые для домена', async () => {
    await expect(service().visibleFor('vedamatch.ru')).resolves.toEqual(['google']);
  });

  it('узнаёт домен портала по хосту API', async () => {
    await expect(service().visibleFor('api.vedamatch.ru')).resolves.toEqual(['google']);
  });

  it('на чужом домене не показывает ничего', async () => {
    await expect(service().visibleFor('example.com')).resolves.toEqual([]);
  });

  it('запрещает вход выключенным способом', async () => {
    await expect(service().assertEnabled('yandex', 'vedamatch.ru')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('пускает включённый способ', async () => {
    await expect(service().assertEnabled('google', 'vedamatch.ru')).resolves.toBeUndefined();
  });
});
