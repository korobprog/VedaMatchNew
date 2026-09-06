import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { PrismaModule } from './prisma/prisma.module';
import { RuPrismaModule } from './prisma/ru-prisma.module';
import { PersonalDataModule } from './modules/personal-data/personal-data.module';
import { AuthModule } from './modules/auth/auth.module';
import { AdminAwareThrottlerGuard } from './modules/auth/admin-unlimited.guard';
import { UsersModule } from './modules/users/users.module';
import { CatalogModule } from './modules/catalog/catalog.module';
import { SelfIdentificationModule } from './modules/self-identification/self-identification.module';
import { UnionModule } from './modules/union/union.module';
import { VedabaseModule } from './modules/vedabase/vedabase.module';
import { MotivationModule } from './modules/motivation/motivation.module';
import { ModerationModule } from './modules/moderation/moderation.module';
import { PortalAccessModule } from './modules/access/access.module';
import { SupportModule } from './modules/support/support.module';
import { TeamApplicationsModule } from './modules/team-applications/team-applications.module';
import { BillingModule } from './modules/billing/billing.module';
import { LibraryModule } from './modules/library/library.module';
import { ChatModule } from './modules/chat/chat.module';
import { MarketModule } from './modules/market/market.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { AstroModule } from './modules/astro/astro.module';
import { StatsModule } from './modules/stats/stats.module';
import { AuditModule } from './modules/audit/audit.module';
import { ChangelogModule } from './modules/changelog/changelog.module';
import { CommunitiesModule } from './modules/communities/communities.module';
import { NoticesModule } from './modules/notices/notices.module';
import { HealthModule } from './modules/health/health.module';
import { TelemetryModule } from './modules/telemetry/telemetry.module';
import { RewardsModule } from './modules/rewards/rewards.module';
import { ActivityModule } from './modules/activity/activity.module';
import { MusicModule } from './modules/music/music.module';
import { AssistantModule } from './modules/assistant/assistant.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '../../.env'],
    }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    // Шина доменных событий: сервисы публикуют факты, не зная о подписчиках.
    EventEmitterModule.forRoot(),
    PrismaModule,
    RuPrismaModule,
    PersonalDataModule,
    HealthModule,
    AuthModule,
    UsersModule,
    CatalogModule,
    SelfIdentificationModule,
    UnionModule,
    VedabaseModule,
    MotivationModule,
    ModerationModule,
    // Граф доступа портала: «открыл ли человек свою активность этому
    // зрителю». Спрашивают лента друзей и сервисы с видимостью «для друзей».
    PortalAccessModule,
    SupportModule,
    TeamApplicationsModule,
    BillingModule,
    LibraryModule,
    ChatModule,
    MarketModule,
    NotificationsModule,
    AstroModule,
    StatsModule,
    AuditModule,
    ChangelogModule,
    CommunitiesModule,
    NoticesModule,
    TelemetryModule,
    RewardsModule,
    ActivityModule,
    MusicModule,
    // Ассистент портала: портальная инфраструктура, сервисы отвечают ему
    // событиями `assistant.tool.*` из своих слушателей.
    AssistantModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: AdminAwareThrottlerGuard }],
})
export class AppModule {}
