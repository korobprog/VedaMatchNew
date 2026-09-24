import { Module } from '@nestjs/common';
import { MusicAssistantListener } from './music-assistant.listener';
import {
  MusicAdminAudiobooksController,
  MusicAudiobooksController,
} from './music-audiobooks.controller';
import { MusicAudiobooksService } from './music-audiobooks.service';
import { AuthModule } from '../auth/auth.module';
import {
  MusicAdminCatalogController,
  MusicAdminQueueController,
} from './music-admin-catalog.controller';
import { MusicAdminCatalogService } from './music-admin-catalog.service';
import { MusicArtistTagsService } from './music-artist-tags.service';
import { MusicAdminQueueService } from './music-admin-queue.service';
import { MusicCatalogController } from './music-catalog.controller';
import { MusicCatalogService } from './music-catalog.service';
import { MusicCoversController } from './music-covers.controller';
import { MusicCoverFilesController } from './music-cover-files.controller';
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
import { MusicBookmarksController } from './music-bookmarks.controller';
import { MusicBookmarksService } from './music-bookmarks.service';
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
import {
  MusicAdminRadioController,
  MusicRadioController,
} from './music-radio.controller';
import { MusicRadioService } from './music-radio.service';
import { MusicDurationRecountService } from './music-duration-recount.service';

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
    MusicAudiobooksController,
    MusicAdminAudiobooksController,
    MusicStreamController,
    MusicCoversController,
    MusicCoverFilesController,
    MusicUploadsController,
    MusicReportsController,
    MusicPlaybackController,
    MusicSettingsController,
    MusicHistoryController,
    MusicBookmarksController,
    MusicFavoritesController,
    MusicPlaylistsController,
    MusicOfflineController,
    MusicAdminCatalogController,
    MusicAdminQueueController,
    MusicIngestController,
    MusicRadioController,
    MusicAdminRadioController,
  ],
  providers: [
    MusicCatalogService,
    MusicAudiobooksService,
    MusicAdminCatalogService,
    MusicArtistTagsService,
    MusicAdminQueueService,
    MusicStorageService,
    MusicCoversService,
    MusicMetadataReader,
    MusicUploadsService,
    MusicReportsService,
    MusicPlaybackService,
    MusicFavoritesService,
    MusicBookmarksService,
    MusicPlaylistsService,
    MusicIngestService,
    MusicIngestFetchService,
    MusicIngestProcessService,
    MusicWorkerService,
    MusicDurationRecountService,
    MusicPurgeListener,
    MusicAssistantListener,
    MusicRadioService,
  ],
})
export class MusicModule {}
