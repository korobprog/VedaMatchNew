import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { MusicUploadsService } from './music-uploads.service';
import { MusicReportsService } from './music-reports.service';
import { MusicPlaybackService } from './music-playback.service';

/**
 * Фоновая стадия сервиса: чистка брошенных загрузок, записи, по которым
 * редакция не решила в срок, протухшее «слушает сейчас» и ретеншен истории.
 *
 * Образец — `MotivationWorkerService`, но без Redis-лиза. Лиз там нужен,
 * потому что стадия тратит деньги на внешние модели, и второй экземпляр
 * оплатил бы ту же генерацию дважды. Здесь худшее, что делают два процесса
 * одновременно, — пытаются удалить один и тот же объект; клейм строки через
 * `updateMany` с проверкой статуса от этого уже защищает, а `DELETE` в S3
 * идемпотентен.
 *
 * Раз в десять минут, а не раз в тридцать секунд: брошенная заливка не
 * горит, а лишний обход таблицы каждые полминуты — это просто нагрузка.
 */
const TICK_MS = 10 * 60 * 1000;

@Injectable()
export class MusicWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MusicWorkerService.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly uploads: MusicUploadsService,
    private readonly reports: MusicReportsService,
    private readonly playback: MusicPlaybackService,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => void this.tick(), TICK_MS);
    // `unref`, иначе таймер держит процесс и тесты не завершаются.
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  /** Пропускаем тик, если предыдущий ещё идёт: очередь тиков не нужна. */
  private async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.stage('чистка брошенных загрузок', () =>
        this.uploads.cleanupStale(),
      );
      // Записи, по которым редакция не решила за неделю: не удаляем, а
      // возвращаем автору с честной причиной.
      await this.stage('разбор просроченных жалоб', () =>
        this.reports.closeOverdue(),
      );
      // Строки «слушает сейчас», по которым heartbeat уже не придёт: вкладку
      // убили мимо `pagehide`. Без этой стадии человек «слушает» третьи сутки.
      await this.stage('снятие протухшего «слушает сейчас»', () =>
        this.playback.sweepStaleNowPlaying(),
      );
      await this.stage('ретеншен истории', () =>
        this.playback.purgeOldListens(),
      );
    } finally {
      this.running = false;
    }
  }

  /**
   * Стадия падает сама по себе и не уносит соседей.
   *
   * Общий `try` на весь тик означал бы, что упавшая чистка бакета лишает
   * работы снятие протухшего «слушает сейчас», — а это уже не мусор в
   * хранилище, а неверный факт о человеке в чужой ленте.
   */
  private async stage(name: string, run: () => Promise<unknown>): Promise<void> {
    try {
      await run();
    } catch (error) {
      this.logger.warn(`Стадия «${name}» не удалась: ${String(error)}`);
    }
  }
}
