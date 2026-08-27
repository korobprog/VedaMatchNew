import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { MusicUploadsService } from './music-uploads.service';

/**
 * Фоновая стадия сервиса: чистка брошенных загрузок.
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

  constructor(private readonly uploads: MusicUploadsService) {}

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
      await this.uploads.cleanupStale();
    } catch (error) {
      // Упавшая чистка не должна ронять процесс: объекты просто останутся
      // в бакете до следующего тика.
      this.logger.warn(`Чистка загрузок не удалась: ${String(error)}`);
    } finally {
      this.running = false;
    }
  }
}
