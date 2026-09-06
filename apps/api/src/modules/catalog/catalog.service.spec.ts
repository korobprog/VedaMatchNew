import { CatalogService } from './catalog.service';

/**
 * Проверяется одно: записи каталога, которые ведут в админку, на витрину не
 * попадают. Карточка обещает сервис, куда заходят пользоваться, а «Вход»
 * заведён ради назначения прав менеджеру — и у администратора он выглядел в
 * общей сетке ровно как остальные.
 */
function make() {
  const findMany = jest.fn().mockResolvedValue([]);
  const prisma = {
    service: { findMany },
    user: { findUnique: jest.fn().mockResolvedValue({ spiritualStage: null }) },
  };
  return { service: new CatalogService(prisma as never), findMany };
}

const excluded = { url: { startsWith: '/admin' } };

describe('CatalogService', () => {
  it('не отдаёт админские записи обычному пользователю', async () => {
    const { service, findMany } = make();

    await service.getForUser('u1', 'user');

    expect(findMany.mock.calls[0][0].where.NOT).toEqual(excluded);
  });

  it('не отдаёт их и администратору: у него они выглядели как сервисы', async () => {
    const { service, findMany } = make();

    await service.getForUser('u1', 'admin');

    const where = findMany.mock.calls[0][0].where as Record<string, unknown>;
    expect(where.NOT).toEqual(excluded);
    // Прочих ограничений у администратора по-прежнему нет.
    expect(where.status).toBeUndefined();
  });

  it('не отдаёт их гостю', async () => {
    const { service, findMany } = make();

    await service.getPublic();

    const where = findMany.mock.calls[0][0].where as Record<string, unknown>;
    expect(where.NOT).toEqual(excluded);
    expect(where.public).toBe(true);
  });
});
