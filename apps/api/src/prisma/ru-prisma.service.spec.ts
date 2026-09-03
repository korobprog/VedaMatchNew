import { RuPrismaService } from './ru-prisma.service';

/**
 * Проверяется только затвор — он решает, уедут ли персональные данные в другую
 * страну. Подключение к живой базе тестом не покрыть, оно проверяется вручную.
 */
describe('RuPrismaService', () => {
  const saved = { url: process.env.RU_DATABASE_URL, on: process.env.RU_CONTOUR_ENABLED };

  afterEach(() => {
    process.env.RU_DATABASE_URL = saved.url;
    process.env.RU_CONTOUR_ENABLED = saved.on;
  });

  it('выключен без строки подключения', async () => {
    delete process.env.RU_DATABASE_URL;
    process.env.RU_CONTOUR_ENABLED = 'true';
    const service = new RuPrismaService();

    await service.onModuleInit();

    expect(service.isConfigured).toBe(false);
  });

  it('выключен, пока не включён явно, даже со строкой подключения', async () => {
    // Наличия адреса недостаточно: он может быть заведён заранее, а решение о
    // том, куда едут персональные данные, обязано быть отдельным.
    process.env.RU_DATABASE_URL = 'postgresql://u:p@h:5432/db';
    process.env.RU_CONTOUR_ENABLED = 'false';
    const service = new RuPrismaService();

    await service.onModuleInit();

    expect(service.isConfigured).toBe(false);
  });

  it('пустая строка подключения не считается заданной', async () => {
    process.env.RU_DATABASE_URL = '   ';
    process.env.RU_CONTOUR_ENABLED = 'true';
    const service = new RuPrismaService();

    await service.onModuleInit();

    expect(service.isConfigured).toBe(false);
  });

  it('обращение к выключенному клиенту — исключение, а не тихий проход', async () => {
    delete process.env.RU_DATABASE_URL;
    const service = new RuPrismaService();
    await service.onModuleInit();

    expect(() => service.db).toThrow(/не настроен/);
  });
});
