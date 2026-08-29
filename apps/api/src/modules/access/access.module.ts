import { Global, Module } from '@nestjs/common';
import { PortalAccessFollowsListener } from './access-follows.listener';
import { PortalAccessService } from './access.service';

/**
 * Граф доступа портала — портальная инфраструктура наравне с
 * `ModerationModule`.
 *
 * Отвечает на один вопрос: открыл ли человек свою активность этому зрителю.
 * Спрашивают его лента друзей и любой сервис с видимостью «для друзей» —
 * сейчас это плейлисты Музыки, дальше будет кто-то ещё.
 *
 * `@Global`, потому что альтернатива — строка импорта в каждом втором
 * сервисном модуле, а сервисный модуль по контракту и так вправе на него
 * опираться. Тот же счёт, что у `PrismaModule`.
 *
 * Контроллеров нет: наружу граф не отдаётся вовсе. Кто кому открыл доступ —
 * это про двоих, и третьему такой список знать незачем.
 */
@Global()
@Module({
  providers: [PortalAccessService, PortalAccessFollowsListener],
  exports: [PortalAccessService],
})
export class PortalAccessModule {}
