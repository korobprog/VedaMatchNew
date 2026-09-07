import { Reflector } from '@nestjs/core';

// jose — ESM-only, ts-jest его не транспилирует, а контроллеры тянут его
// через AuthGuard. Тому же приёму следует auth/admin-unlimited.guard.spec.ts.
jest.mock('../auth/jwt.service', () => ({ JwtSignService: class {} }));

import {
  MusicAdminCatalogController,
  MusicAdminQueueController,
} from './music-admin-catalog.controller';
import { MusicIngestController } from './music-ingest.controller';

/**
 * Администратор Музыки не считается по общему лимиту запросов.
 *
 * Тест на метку, а не на поведение троттлера: само поведение проверено в
 * `auth/admin-unlimited.guard.spec.ts`, а сломать здесь можно ровно одно —
 * забыть декоратор на новом админском контроллере. Ровно это и случилось:
 * механизм в портале был, Чат и Образование им пользовались, а админка
 * Музыки жила под лимитом 120 запросов в час.
 *
 * Почему этого хватало, чтобы раздел выглядел нерабочим: страница
 * справочников тянет четыре списка на каждую отрисовку, а каждое действие
 * заканчивается `router.refresh()` — то есть теми же четырьмя запросами.
 * Одно действие стоит пяти обращений, и лимит кончался на двадцать четвёртом.
 */
describe('лимит запросов в админке Музыки', () => {
  const reflector = new Reflector();
  const metaOf = (target: Function) =>
    reflector.get<boolean | string | undefined>('admin-unlimited', target);

  const controllers: [string, Function][] = [
    ['справочники каталога', MusicAdminCatalogController],
    ['очередь, сводка и жалобы', MusicAdminQueueController],
    ['редакционное пополнение', MusicIngestController],
  ];

  it.each(controllers)('%s: администратору Музыки лимит не считается', (_name, controller) => {
    // Именно слаг, а не `true`: с ним послабление достаётся и
    // `service-admin`, которому назначена Музыка, — он и ведёт каталог.
    expect(metaOf(controller)).toBe('music');
  });
});
