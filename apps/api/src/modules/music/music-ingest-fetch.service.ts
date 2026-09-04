import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { lookup } from 'node:dns/promises';
import { PassThrough } from 'node:stream';
import { once } from 'node:events';
import {
  checkContentType,
  formatBytesLimit,
  IngestByteMeter,
  ingestFetchReason,
  isRedirectStatus,
  isRetryableRejection,
  resolveIngestMime,
  resolveRedirect,
  type IngestFetchRejection,
} from './ingest-fetch-limits';
import { checkIngestUrl, isPrivateAddress } from './ingest-url-guard';
import { MusicStorageService } from './music-storage.service';
import { MUSIC_UPLOAD_DEFAULT_LIMITS } from './music-upload-validate';

/**
 * Сколько ждём одну позицию целиком: и заголовки, и все её байты.
 *
 * Пятнадцать минут — это 150 МБ на канале примерно в 170 кбит/с, то есть
 * заведомо хуже всего, что бывает у площадки с файлами. Срок нужен не ради
 * скорости, а чтобы позиция, попавшая на сервер, который принял соединение и
 * замолчал, не держала слот очереди до перезапуска процесса. Порог зависания
 * в `ingest-state.ts` вдвое больше — иначе позицию отбирали бы у живого
 * скачивания.
 */
const FETCH_TIMEOUT_MS = 15 * 60 * 1000;

/**
 * Отказ скачивания с готовой причиной. Отдельным классом, чтобы обработка
 * отличала приговор («не аудио», «внутренняя сеть») от сбоя, который может
 * пройти со следующей попытки, и не гоняла впустую три попытки за одним и
 * тем же ответом.
 */
export class IngestFetchError extends Error {
  constructor(
    readonly rejection: IngestFetchRejection,
    readonly reason: string,
  ) {
    super(reason);
    this.name = 'IngestFetchError';
  }

  get retryable(): boolean {
    return isRetryableRejection(this.rejection);
  }
}

export interface FetchedIngestObject {
  storageKey: string;
  sizeBytes: number;
  /** MD5 содержимого — тот же отпечаток, что даёт ETag однокусочной заливки. */
  checksum: string;
  mime: string;
}

/**
 * Доставка байтов по прямой ссылке.
 *
 * Ручка «добавить по ссылке» заставляет **наш** сервер сделать запрос —
 * то есть это SSRF, и обращаться с ней надо соответственно. Защит здесь три,
 * и ни одна не заменяет остальные:
 *
 * 1. **Адрес.** `checkIngestUrl` отбивает чужие схемы и литеральные адреса
 *    внутренней сети, а `dns.lookup(..., { all: true })` — имена, которые в
 *    неё резолвятся. Сверяется **каждый** адрес из ответа: `evil.example`
 *    спокойно отдаёт `A`-записи и на публичный, и на `127.0.0.1`, и выбор
 *    первого из списка не защищает ни от чего.
 * 2. **Редиректы.** `redirect: 'manual'` и ручной проход по `Location`, с
 *    повтором обеих проверок на каждом шаге. Автоматические редиректы
 *    `fetch` тут недопустимы: они уводят мимо проверки, и внешний сайт одним
 *    `302` доводит нас до `169.254.169.254`.
 * 3. **Размер.** Считаются фактически принятые байты, а не `Content-Length`:
 *    тот — заявление сервера. Поток рвётся на первом лишнем байте, а не
 *    после того, как файл целиком лёг в бакет.
 *
 * Чего эта защита не закрывает: между `lookup` и соединением проходит
 * мгновение, и зона с однисекундным TTL может за него поменять ответ
 * (DNS rebinding). Закрыть это можно только соединением по уже проверенному
 * адресу с подменой `Host`, чего `fetch` не позволяет; при появлении такой
 * нужды сюда придёт свой `undici.Agent` с `connect.lookup`. Пока ручка
 * доступна только админам, и порог «админ портала против одной пересборки
 * зоны» считается приемлемым — но молчать об этом нельзя.
 */
@Injectable()
export class MusicIngestFetchService {
  private readonly logger = new Logger(MusicIngestFetchService.name);
  private readonly maxBytes: number;

  constructor(
    private readonly storage: MusicStorageService,
    config: ConfigService,
  ) {
    const raw = Number(config.get<string>('MUSIC_MAX_UPLOAD_BYTES'));
    this.maxBytes =
      Number.isFinite(raw) && raw > 0
        ? raw
        : MUSIC_UPLOAD_DEFAULT_LIMITS.maxBytes;
  }

  /**
   * Скачать запись и положить её в редакционное пространство бакета.
   *
   * `remainingBatchBytes` — сколько партии ещё разрешено занять. Предел у
   * позиции получается меньший из двух: свой потолок файла и остаток партии.
   * Без второго список из тысячи ссылок вылил бы в бакет всё, что лежало на
   * той стороне: у каждой ссылки по отдельности размер законный.
   */
  async fetchUrl(
    batchId: string,
    url: string,
    remainingBatchBytes = Number.POSITIVE_INFINITY,
  ): Promise<FetchedIngestObject> {
    if (!this.storage.configured) {
      throw new IngestFetchError('unreachable', 'Хранилище не настроено');
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    // Таймер не должен держать процесс живым: он висит пятнадцать минут, а
    // выключение API ждать их не станет.
    timer.unref?.();

    try {
      const response = await this.openStream(url, controller.signal);
      return await this.storeStream(
        batchId,
        response,
        remainingBatchBytes,
        controller,
      );
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Пройти цепочку пересылок и вернуть ответ с телом.
   *
   * Проверки повторяются на каждом шаге целиком — и адрес, и резолв. Это не
   * перестраховка: первый адрес мог быть безупречным, а третий вести в
   * петлю.
   */
  private async openStream(
    startUrl: string,
    signal: AbortSignal,
  ): Promise<{ response: Response; url: string }> {
    let current = startUrl.trim();
    let redirectsDone = 0;

    const initial = checkIngestUrl(current);
    if (initial) throw this.reject(initial);
    await this.assertPublicHost(current);

    // Цикл ограничен сверху `resolveRedirect`: он отказывает, как только
    // пересылок стало больше разрешённого, и бесконечным этот `while` быть
    // не может.
    for (;;) {
      let response: Response;
      try {
        response = await fetch(current, {
          // Ровно это и есть защита от увода: автоматический редирект прошёл
          // бы мимо проверки адреса.
          redirect: 'manual',
          signal,
          headers: {
            // Просим именно аудио, но не отказываемся от прочего: половина
            // площадок отдаёт mp3 под `application/octet-stream`.
            Accept: 'audio/*,application/octet-stream;q=0.8,*/*;q=0.5',
            'User-Agent': 'VedaMatch-Music-Ingest/1.0',
          },
        });
      } catch (error) {
        // Сюда же приходит обрыв по таймауту: снаружи это одно и то же —
        // байтов нет.
        this.logger.warn(`Не удалось скачать ${current}: ${String(error)}`);
        throw this.reject('unreachable');
      }

      if (isRedirectStatus(response.status)) {
        // Тело пересылки нам не нужно, но бросить его нельзя: незакрытое
        // соединение остаётся в пуле undici до таймаута.
        await response.body?.cancel().catch(() => undefined);

        const next = resolveRedirect(
          current,
          response.headers.get('location'),
          redirectsDone,
        );
        if (!next.ok) throw this.reject(next.rejection);

        current = next.url;
        redirectsDone += 1;
        // Имя нового адреса резолвится заново: проверка строки говорит лишь
        // о том, что это не литеральный `127.0.0.1`.
        await this.assertPublicHost(current);
        continue;
      }

      if (!response.ok) {
        await response.body?.cancel().catch(() => undefined);
        throw this.reject('http_error', response.status);
      }

      return { response, url: current };
    }
  }

  /**
   * Тело — в бакет потоком, со счётчиком и MD5 по дороге.
   *
   * Ни одного `Buffer.concat` на пути: файл нигде не существует целиком,
   * кроме как в S3.
   */
  private async storeStream(
    batchId: string,
    fetched: { response: Response; url: string },
    remainingBatchBytes: number,
    controller: AbortController,
  ): Promise<FetchedIngestObject> {
    const { response, url } = fetched;

    const contentType = checkContentType(response.headers.get('content-type'));
    if (!contentType.ok) {
      await response.body?.cancel().catch(() => undefined);
      throw this.reject('not_audio', contentType.declared);
    }
    const mime = resolveIngestMime(contentType.mime, url);

    // Предел позиции — меньший из двух: свой потолок файла и остаток партии.
    const limit = Math.max(0, Math.min(this.maxBytes, remainingBatchBytes));

    if (!response.body) {
      throw this.reject('empty_body');
    }

    const key = this.storage.buildIngestKey(batchId, extensionFor(mime));
    const meter = new IngestByteMeter(limit);
    const sink = new PassThrough();
    const upload = this.storage.putStream(key, sink, mime);
    // Пока поток не дочитан, отказ заливки ловить некому, а необработанное
    // отклонение промиса в Node роняет процесс. Настоящую ошибку всё равно
    // достанем ниже, из `await upload`.
    upload.catch(() => undefined);

    try {
      for await (const chunk of response.body as AsyncIterable<Uint8Array>) {
        if (!meter.push(chunk)) {
          // Рвём с обоих концов: соединение — чтобы не тянуть остаток файла,
          // заливку — чтобы `Upload` не досылал части и не оставлял в бакете
          // недоделанную многочастную загрузку.
          controller.abort();
          sink.destroy(new Error('Превышен предел размера'));
          throw this.reject(
            'too_large',
            formatBytesLimit(
              // В причине называем тот предел, обо что позиция и споткнулась:
              // «файл больше 150 МБ» и «партия переполнена» — разные новости.
              limit < this.maxBytes ? limit : this.maxBytes,
            ),
          );
        }
        // Обратное давление: без ожидания `drain` быстрый источник набьёт
        // буфер `PassThrough` теми самыми мегабайтами, которых мы избегали.
        if (!sink.write(chunk)) await once(sink, 'drain');
      }

      sink.end();
      await upload;
    } catch (error) {
      controller.abort();
      if (!sink.destroyed) sink.destroy();
      // Обрывок в бакете не нужен: место занимает, а положиться на него
      // нельзя — файл в нём неполный.
      await this.storage.remove(key);
      if (error instanceof IngestFetchError) throw error;
      this.logger.warn(`Заливка ${url} не удалась: ${String(error)}`);
      throw this.reject('unreachable');
    }

    if (meter.sizeBytes === 0) {
      await this.storage.remove(key);
      throw this.reject('empty_body');
    }

    return {
      storageKey: key,
      sizeBytes: meter.sizeBytes,
      checksum: meter.checksum,
      mime,
    };
  }

  /**
   * Имя резолвится, и **каждый** полученный адрес сверяется с приватными
   * диапазонами. Именно каждый: имя с двумя `A`-записями — публичной и
   * петлевой — обычный приём обхода проверки, которая смотрит на первый
   * ответ.
   */
  private async assertPublicHost(rawUrl: string): Promise<void> {
    let hostname: string;
    try {
      hostname = new URL(rawUrl).hostname;
    } catch {
      throw this.reject('malformed');
    }

    // Литеральный адрес резолвить нечего, и `checkIngestUrl` его уже
    // проверил — но повторная проверка бесплатна и снимает вопрос о порядке
    // вызовов.
    const literal = hostname.replace(/^\[|\]$/g, '');
    if (isPrivateAddress(literal)) throw this.reject('private_address');

    let records: { address: string }[];
    try {
      records = await lookup(hostname, { all: true });
    } catch (error) {
      this.logger.warn(`Имя ${hostname} не резолвится: ${String(error)}`);
      throw this.reject('unreachable');
    }

    if (records.length === 0) throw this.reject('unreachable');
    for (const record of records) {
      if (isPrivateAddress(record.address)) {
        throw this.reject('private_address');
      }
    }
  }

  private reject(
    rejection: IngestFetchRejection,
    detail?: string | number,
  ): IngestFetchError {
    return new IngestFetchError(
      rejection,
      ingestFetchReason(rejection, detail),
    );
  }
}

/** Расширение ключа по типу: обработка читает тип обратно именно из ключа. */
function extensionFor(mime: string): string {
  return mime === 'audio/mp4' ? 'm4a' : 'mp3';
}
