import { Module } from '@nestjs/common';
import { MusicAssistantListener } from './music-assistant.listener';
import { AuthModule } from '../auth/auth.module';
import {
  MusicAdminCatalogController,
  MusicAdminQueueController,
} from './music-admin-catalog.controller';
import { MusicAdminCatalogService } from './music-admin-catalog.service';
import { MusicAdminQueueService } from './music-admin-queue.service';
import { MusicCatalogController } from './music-catalog.controller';
import { MusicCatalogService } from './music-catalog.service';
import { MusicCoversController } from './music-covers.controller';
import { MusicCoversService } from './music-covers.service';
import { MusicIngestController } from './music-ingest.controller';
import { MusicIngestFetchService } from './music-ingest-fetch.service';
import { MusicIngestProcessService } from './music-ingest-process.service';
import { MusicIngestService } from './music-ingest.service';
import { MusicMetadataReader } from './music-metadata-reader';
import {
  MusicFavoritesController,
  MusicHistoryController,
  MusicPlaybackController,
  MusicSettingsController,
} from './music-playback.controller';
import { MusicPlaybackService } from './music-playback.service';
import { MusicFavoritesService } from './music-favorites.service';
import { MusicOfflineController } from './music-offline.controller';
import { MusicPlaylistsController } from './music-playlists.controller';
import { MusicPlaylistsService } from './music-playlists.service';
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
    MusicCoversController,
    MusicUploadsController,
    MusicReportsController,
    MusicPlaybackController,
    MusicSettingsController,
    MusicHistoryController,
    MusicFavoritesController,
    MusicPlaylistsController,
    MusicOfflineController,
    MusicAdminCatalogController,
    MusicAdminQueueController,
    MusicIngestController,
  ],
  providers: [
    MusicCatalogService,
    MusicAdminCatalogService,
    MusicAdminQueueService,
    MusicStorageService,
    MusicCoversService,
    MusicMetadataReader,
    MusicUploadsService,
    MusicReportsService,
    MusicPlaybackService,
    MusicFavoritesService,
    MusicPlaylistsService,
    MusicIngestService,
    MusicIngestFetchService,
    MusicIngestProcessService,
    MusicWorkerService,
    MusicPurgeListener,
    MusicAssistantListener,
  ],
})
export class MusicModule {}
