import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { CatalogModule } from './modules/catalog/catalog.module';
import { SelfIdentificationModule } from './modules/self-identification/self-identification.module';
import { UnionModule } from './modules/union/union.module';
import { VedabaseModule } from './modules/vedabase/vedabase.module';
import { MotivationModule } from './modules/motivation/motivation.module';
import { ModerationModule } from './modules/moderation/moderation.module';
import { SupportModule } from './modules/support/support.module';
import { BillingModule } from './modules/billing/billing.module';
import { LibraryModule } from './modules/library/library.module';
import { MarketModule } from './modules/market/market.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { AstroModule } from './modules/astro/astro.module';
import { StatsModule } from './modules/stats/stats.module';
import { ContactsModule } from './modules/contacts/contacts.module';
import { ChangelogModule } from './modules/changelog/changelog.module';
import { CommunitiesModule } from './modules/communities/communities.module';
import { NoticesModule } from './modules/notices/notices.module';
import { HealthModule } from './modules/health/health.module';

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
    HealthModule,
    AuthModule,
    UsersModule,
    CatalogModule,
    SelfIdentificationModule,
    UnionModule,
    VedabaseModule,
    MotivationModule,
    ModerationModule,
    SupportModule,
    BillingModule,
    LibraryModule,
    MarketModule,
    NotificationsModule,
    AstroModule,
    StatsModule,
    ContactsModule,
    ChangelogModule,
    CommunitiesModule,
    NoticesModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
