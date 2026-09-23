import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { AppReleasePublishedEvent } from '@vedamatch/shared';
import Redis from 'ioredis';
import { PrismaService } from '../../prisma/prisma.service';
import {
  APP_DOWNLOAD_PATH,
  APP_RELEASE_PUBLISHED,
  appManifestUrl,
  newReleaseStatus,
  parseReleaseManifest,
  TRACKED_APP_VARIANTS,
  type ReleaseManifest,
} from './app-release';
import { updatePromptDecision, updatePromptPayload } from './app-update-prompt';
import { FcmSenderService } from './fcm-sender.service';
import {
  deliveryHealthSelect,
  NotificationsService,
} from './notifications.service';

const TICK_MS = 60_000;
const LEASE_MS = 300_000;
/** Сколько тик обходит телефоны, прежде чем отпустить лиз. */
const TICK_BUDGET_MS = 60_000;
const DEVICE_BATCH = 200;
const PUSH_CONCURRENCY = 10;
const MAX_ATTEMPTS = 3;
/** Объявление «в работе» дольше этого — воркер упал посреди него. */
const ANNOUNCE_LEASE_MS = 5 * 60_000;
const MANIFEST_TIMEOUT_MS = 10_000;

type TrackedRelease = {
  variant: string;
  versionCode: number;
  versionName: string;
};

/**
 * Новая версия приложения с сайта: объявление в официальном канале и пуш
 * «обновите» отставшим телефонам.
 *
 * О выходе версии сервер узнаёт сам, читая раз в минуту `latest.json` —
 * тот же манифест, что раздаёт APK приложению и странице /app. Не ручкой,
 * которую дёргает CI: той понадобился бы новый секрет у CI и у сервера, а
 * пропущенный вызов (сервер перезапускался, сеть моргнула) молча терял бы
 * выпуск. Чтение манифеста догоняет выпуск со следующего тика, а сбой
 * чтения пишется в лог каждый раз.
 *
 * Устроен как MotivationWorkerService: тик под Redis-лизом (`SET NX PX`),
 * клейм через `updateMany` с проверкой статуса — и объявления, и пуша
 * каждому телефону, — ретраи по `attemptCount`, возврат зависших по
 * `updatedAt`.
 */
@Injectable()
export class AppReleaseWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AppReleaseWorkerService.name);
  private readonly redis: Redis | null;
  private readonly manifestBaseUrl: string | null;
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
    private readonly fcm: FcmSenderService,
    private readonly notifications: NotificationsService,
    config: ConfigService,
  ) {
    const host = config.get<string>('REDIS_HOST');
    this.redis = host
      ? new Redis({
          host,
          port: Number(config.get('REDIS_PORT') || 6379),
          db: Number(config.get('REDIS_DB') || 0),
          password: config.get<string>('REDIS_PASSWORD') || undefined,
          lazyConnect: true,
          maxRetriesPerRequest: 1,
        })
      : null;
    // Тот же адрес, что у страницы /app и самообновления: публичная раздача
    // S3. Отдельная переменная нужна, только если APK лежат не в S3 портала.
    this.manifestBaseUrl =
      config.get<string>('APP_DOWNLOAD_BASE_URL')?.trim() ||
      config.get<string>('S3_PUBLIC_URL')?.trim() ||
      null;
  }

  async onModuleInit(): Promise<void> {
    if (!this.manifestBaseUrl) {
      // Локально S3 обычно не настроен — это штатно: выпусков просто нет.
      this.logger.log(
        'APP_DOWNLOAD_BASE_URL и S3_PUBLIC_URL не заданы — за выпусками приложения не следим',
      );
      return;
    }
    if (this.redis)
      await this.redis
        .connect()
        .catch((error) =>
          this.logger.warn(`Redis unavailable: ${String(error)}`),
        );
    this.timer = setInterval(() => void this.tick(), TICK_MS);
    this.timer.unref();
  }

  async onModuleDestroy(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    if (this.redis?.status === 'ready') await this.redis.quit();
  }

  async tick(now = new Date()): Promise<void> {
    if (this.running || !this.manifestBaseUrl) return;
    this.running = true;
    const lockKey = 'notifications:app-release:lease';
    const token = crypto.randomUUID();
    if (this.redis?.status === 'ready') {
      const acquired = await this.redis
        .set(lockKey, token, 'PX', LEASE_MS, 'NX')
        .catch(() => null);
      if (!acquired) {
        this.running = false;
        return;
      }
    }
    try {
      for (const variant of TRACKED_APP_VARIANTS)
        await this.runVariant(variant, now);
      await this.announcePending(now);
    } catch (error) {
      this.logger.error(
        'Тик выпусков приложения упал',
        error instanceof Error ? error.stack : String(error),
      );
    } finally {
      if (this.redis?.status === 'ready')
        await this.redis
          .eval(
            "if redis.call('get',KEYS[1]) == ARGV[1] then return redis.call('del',KEYS[1]) else return 0 end",
            1,
            lockKey,
            token,
          )
          .catch(() => undefined);
      this.running = false;
    }
  }

  private async runVariant(variant: string, now: Date): Promise<void> {
    const manifest = await this.fetchManifest(variant);
    // Манифест не прочитан — ни объявлять, ни звать: неизвестно, какая
    // версия сейчас раздаётся. Пуш о версии, которую убрали откатом, увёл бы
    // человека к «у вас последняя версия».
    if (!manifest) return;
    const release = await this.recordRelease(variant, manifest);
    if (release.status === 'baseline') return;
    await this.promptOutdated(
      {
        variant,
        versionCode: release.versionCode,
        versionName: release.versionName,
      },
      now,
    );
  }

  private async fetchManifest(
    variant: string,
  ): Promise<ReleaseManifest | null> {
    const url = appManifestUrl(this.manifestBaseUrl!, variant);
    try {
      const response = await fetch(url, {
        headers: { 'cache-control': 'no-cache' },
        signal: AbortSignal.timeout(MANIFEST_TIMEOUT_MS),
      });
      if (!response.ok) {
        this.logger.warn(`Манифест ${url} ответил ${response.status}`);
        return null;
      }
      const manifest = parseReleaseManifest(await response.json());
      if (!manifest) this.logger.warn(`Манифест ${url} не разобран`);
      return manifest;
    } catch (error) {
      this.logger.warn(
        `Манифест ${url} не прочитан: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }

  /**
   * Строка выпуска для версии из манифеста. Уже есть — какая есть; нет —
   * заводится со статусом по `newReleaseStatus`. Уникальный индекс
   * «вариант + versionCode» не даст двум процессам завести её дважды.
   */
  private async recordRelease(
    variant: string,
    manifest: ReleaseManifest,
  ): Promise<{ status: string; versionCode: number; versionName: string }> {
    const where = {
      variant_versionCode: { variant, versionCode: manifest.versionCode },
    };
    const select = { status: true, versionCode: true, versionName: true };
    const existing = await this.prisma.notificationAppRelease.findUnique({
      where,
      select,
    });
    if (existing) return existing;
    const known = await this.prisma.notificationAppRelease.aggregate({
      where: { variant },
      _max: { versionCode: true },
    });
    const status = newReleaseStatus(
      known._max.versionCode ?? null,
      manifest.versionCode,
    );
    try {
      const created = await this.prisma.notificationAppRelease.create({
        data: {
          variant,
          versionCode: manifest.versionCode,
          versionName: manifest.versionName,
          notes: manifest.notes,
          builtAt: manifest.builtAt,
          status,
        },
        select,
      });
      this.logger.log(
        status === 'pending'
          ? `Новый выпуск ${variant} ${manifest.versionName} (${manifest.versionCode})`
          : `Выпуск ${variant} ${manifest.versionCode} принят как исходный, без объявления`,
      );
      return created;
    } catch (error) {
      if ((error as { code?: string } | null)?.code !== 'P2002') throw error;
      return (await this.prisma.notificationAppRelease.findUnique({
        where,
        select,
      }))!;
    }
  }

  /**
   * Объявить новые выпуски: событие на шину, подписчик ставит пост в канал.
   * `emitAsync` — чтобы узнать ответ подписчика: `false` значит «не вышло»,
   * и выпуск вернётся в очередь.
   */
  private async announcePending(now: Date): Promise<void> {
    const staleBefore = new Date(now.getTime() - ANNOUNCE_LEASE_MS);
    await this.prisma.notificationAppRelease.updateMany({
      where: {
        status: 'announcing',
        updatedAt: { lt: staleBefore },
        attemptCount: { lt: MAX_ATTEMPTS },
      },
      data: { status: 'pending', errorMessage: 'lease_expired' },
    });
    await this.prisma.notificationAppRelease.updateMany({
      where: {
        status: 'announcing',
        updatedAt: { lt: staleBefore },
        attemptCount: { gte: MAX_ATTEMPTS },
      },
      data: { status: 'failed', errorMessage: 'lease_expired' },
    });

    const pending = await this.prisma.notificationAppRelease.findMany({
      where: { status: 'pending', attemptCount: { lt: MAX_ATTEMPTS } },
      orderBy: { versionCode: 'asc' },
    });
    for (const release of pending) {
      const claimed = await this.prisma.notificationAppRelease.updateMany({
        where: { id: release.id, status: 'pending' },
        data: { status: 'announcing', attemptCount: { increment: 1 } },
      });
      if (claimed.count === 0) continue;
      const attempt = release.attemptCount + 1;
      const event: AppReleasePublishedEvent = {
        variant: release.variant,
        versionCode: release.versionCode,
        versionName: release.versionName,
        notes: release.notes,
        path: APP_DOWNLOAD_PATH,
        builtAt: release.builtAt?.toISOString() ?? null,
      };
      let ok = false;
      let reason = 'подписчик ответил отказом';
      try {
        const answers: unknown[] = await this.events.emitAsync(
          APP_RELEASE_PUBLISHED,
          event,
        );
        ok = !answers.includes(false);
      } catch (error) {
        reason = error instanceof Error ? error.message : String(error);
      }
      await this.prisma.notificationAppRelease.update({
        where: { id: release.id },
        data: ok
          ? { status: 'announced', announcedAt: now, errorMessage: null }
          : {
              status: attempt >= MAX_ATTEMPTS ? 'failed' : 'pending',
              errorMessage: reason.slice(0, 500),
            },
      });
      if (!ok)
        this.logger.warn(
          `Выпуск ${release.variant} ${release.versionCode} не объявлен (попытка ${attempt}): ${reason}`,
        );
    }
  }

  /**
   * Пуш «обновите» отставшим телефонам этого варианта. Обход по курсору: в
   * выборку попадают и ночные телефоны, которые ждут утра, — без курсора
   * пачка из них загородила бы остальных.
   */
  private async promptOutdated(
    release: TrackedRelease,
    now: Date,
  ): Promise<void> {
    // Без ключа FCM слать нечем — и отмечать никого нельзя: иначе после
    // починки ключа о выпуске уже никто бы не узнал.
    if (!this.fcm.configured) return;
    const payload = updatePromptPayload(release);
    const until = Date.now() + TICK_BUDGET_MS;
    let cursor: string | undefined;

    while (Date.now() < until) {
      const devices = await this.prisma.notificationDevice.findMany({
        where: {
          ...(cursor ? { id: { gt: cursor } } : {}),
          provider: 'fcm',
          appVariant: release.variant,
          deadSince: null,
          OR: [
            { appVersionCode: null },
            { appVersionCode: { lt: release.versionCode } },
          ],
          AND: [
            {
              OR: [
                { updatePromptedCode: null },
                { updatePromptedCode: { lt: release.versionCode } },
              ],
            },
          ],
          user: { deletedAt: null, accountStatus: 'active' },
        },
        orderBy: { id: 'asc' },
        take: DEVICE_BATCH,
        select: {
          id: true,
          token: true,
          appVariant: true,
          appVersionCode: true,
          updatePromptedCode: true,
          ...deliveryHealthSelect,
          user: {
            select: {
              timeZone: true,
              notificationPreference: {
                select: { enabled: true, announcements: true },
              },
            },
          },
        },
      });
      if (devices.length === 0) return;
      cursor = devices[devices.length - 1].id;

      const toPush: typeof devices = [];
      for (const device of devices) {
        const decision = updatePromptDecision(
          {
            appVariant: device.appVariant,
            appVersionCode: device.appVersionCode,
            updatePromptedCode: device.updatePromptedCode,
            timeZone: device.user.timeZone,
            preference: device.user.notificationPreference,
          },
          release,
          now,
        );
        if (decision === 'none' || decision === 'wait') continue;
        // Клейм до отправки: отметку ставит тот, кто первым её поставил, —
        // второй процесс тот же телефон уже не возьмёт.
        const claimed = await this.prisma.notificationDevice.updateMany({
          where: {
            id: device.id,
            OR: [
              { updatePromptedCode: null },
              { updatePromptedCode: { lt: release.versionCode } },
            ],
          },
          data: { updatePromptedCode: release.versionCode },
        });
        if (claimed.count === 1 && decision === 'push') toPush.push(device);
      }

      for (let i = 0; i < toPush.length; i += PUSH_CONCURRENCY) {
        await Promise.all(
          toPush.slice(i, i + PUSH_CONCURRENCY).map(async (device) => {
            const failure = await this.fcm.send(device.token, payload);
            await this.notifications.recordDeviceResult(device, failure);
          }),
        );
      }
      if (toPush.length > 0)
        this.logger.log(
          `Позвали обновиться до ${release.versionCode}: ${toPush.length} телефонов`,
        );
      if (devices.length < DEVICE_BATCH) return;
    }
  }
}
