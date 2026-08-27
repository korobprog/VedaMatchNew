import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import {
  MusicAdminCatalogController,
  MusicAdminQueueController,
} from './music-admin-catalog.controller';
import { MusicAdminCatalogService } from './music-admin-catalog.service';
import { MusicAdminQueueService } from './music-admin-queue.service';
import { MusicCatalogController } from './music-catalog.controller';
import { MusicCatalogService } from './music-catalog.service';
import { MusicMetadataReader } from './music-metadata-reader';
import {
  MusicFavoritesController,
  MusicPlaybackController,
  MusicSettingsController,
} from './music-playback.controller';
import { MusicPlaybackService } from './music-playback.service';
import { MusicFavoritesService } from './music-favorites.service';
import { MusicPurgeListener } from './music-purge.listener';
import { MusicStorageService } from './music-storage.service';
import { MusicStreamController } from './music-stream.controller';
import {
  MusicReportsController,
  MusicUploadsController,
} from './music-uploads.controller';
import { MusicUploadsService } from './music-uploads.service';
import { MusicReportsService } from './music-reports.service';
import { MusicWorkerService } from './music-worker.service';

/**
 * Сервис «Музыка». См. docs/music-service-plan.md.
 *
 * По контракту сервисного модуля импортирует только портальную
 * инфраструктуру: `AuthModule`. `PrismaService` глобальный, `EventEmitter2`
 * инжектится напрямую. Чужие фичевые модули не импортируются — общие хелперы
 * (`is-admin.ts`, транслитерация слага, обвязка S3) продублированы внутри
 * папки.
 *
 * Этапы 1–3: каталог, справочники, загрузка мимо API, подписанная отдача и
 * серверная половина плеера. Плейлисты — этап 4.
 */
@Module({
  imports: [AuthModule],
  controllers: [
    MusicCatalogController,
    MusicStreamController,
    MusicUploadsController,
    MusicReportsController,
    MusicPlaybackController,
    MusicSettingsController,
    MusicFavoritesController,
    MusicAdminCatalogController,
    MusicAdminQueueController,
  ],
  providers: [
    MusicCatalogService,
    MusicAdminCatalogService,
    MusicAdminQueueService,
    MusicStorageService,
    MusicMetadataReader,
    MusicUploadsService,
    MusicReportsService,
    MusicPlaybackService,
    MusicFavoritesService,
    MusicWorkerService,
    MusicPurgeListener,
  ],
})
export class MusicModule {}
