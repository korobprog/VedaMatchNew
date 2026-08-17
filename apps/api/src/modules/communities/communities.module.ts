import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import {
  AdminCommunitiesController,
  CommunitiesController,
} from './communities.controller';
import { CommunitiesService } from './communities.service';
import { CommunityMembersService } from './community-members.service';

/**
 * Портальная инфраструктура наравне с `ModerationModule`: общины нужны всем
 * сервисам сразу, поэтому модуль экспортирует `CommunitiesService` и его
 * разрешено импортировать. Узкий контракт наружу — `membershipsOf`,
 * `badgeFor`, `canPostAs`; прямые запросы к таблицам `Community*` из
 * сервисного модуля запрещены, см. docs/service-module-contract.md.
 */
@Module({
  imports: [AuthModule],
  controllers: [CommunitiesController, AdminCommunitiesController],
  providers: [CommunitiesService, CommunityMembersService],
  exports: [CommunitiesService],
})
export class CommunitiesModule {}
