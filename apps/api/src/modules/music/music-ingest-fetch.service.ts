import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { lookup } from 'node:dns/promises';
import { PassThrough } from 'node:stream';
import { once } from 'node:events';
import { Parse as ParseZip } from 'unzipper';
import {
  checkContentType,
  formatBytesLimit,
  IngestByteMeter,
  ingestBatchLimitNotice,
  ingestEntryBudget,
  ingestFetchReason,
  isRedirectStatus,
  isRetryableRejection,
  resolveIngestMime,
  resolveRedirect,
  type IngestEntryBudget,
  type IngestFetchRejection,
} from './ingest-fetch-limits';
import {
  acceptZipEntry,
  zipRejectionReason,
  INGEST_ZIP_MAX_TOTAL_BYTES,
  type IngestZipSeen,
} from './ingest-zip-entry';
import { checkIngestUrl, isPrivateAddress } from './ingest-url-guard';
import { MusicStorageService } from './music-storage.service';
import {
  MUSIC_INGEST_DEFAULT_BATCH_QUOTA_BYTES,
  MUSIC_UPLOAD_DEFAULT_LIMITS,
} from './music-upload-validate';

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

/**
 * Запись, вынутая из архива и уже лежащая в бакете. Позицию по ней заводит
 * обработка: доставка в базу не ходит, у неё другая работа.
 */
export interface ExtractedArchiveEntry {
  /** Имя записи в архиве — оно же `sourceRef` позиции. */
  entryPath: string;
  storageKey: string;
  sizeBytes: number;
  checksum: string;
  mime: string;
}

/**
 * Куда уходит каждая вынутая запись — **сразу после того, как её объект лёг
 * в бакет**, а не общим списком в конце.
 *
 * Порядок здесь и есть смысл: пока ключи копились в массиве и попадали в
 * базу одной транзакцией, любой сбой между заливкой и коммитом оставлял
 * полный комплект объектов, о которых не знает никто, — уборка партии ищет
 * их по позициям, а позиций нет. Колбэк заводит позицию по каждому ключу
 * по мере появления, и в базу он не ходит сам: базой владеет обработка.
 *
 * Бросить из него можно: тогда объект этой записи убирается, а разбор
 * останавливается — ключ без строки не должен пережить вызов.
 */
export type ArchiveEntrySink = (entry: ExtractedArchiveEntry) => Promise<void>;

/**
 * Чем кончился разбор архива.
 *
 * Записей здесь нет — они уже ушли в `ArchiveEntrySink` по одной. Осталось
 * то, чего колбэк не знает: сколько их было всего и почему разбор кончился
 * раньше архива.
 *
 * `truncatedReason` — про **честно неполный** разбор: партия упирается в
 * свой потолок на середине архива, и остаток дорожек в неё уже не влезает,
 * но те, что влезли, остаются. Они законная часть партии, и стирать их
 * значит наказывать редакцию за размер архива.
 */
export interface ExpandedArchive {
  /** Сколько записей ушло в колбэк — столько позиций и завелось. */
  takenCount: number;
  /** `null` — архив разобран целиком. Иначе пометка словами, почему нет. */
  truncatedReason: string | null;
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
  /**
   * Потолок партии. Загрузчику он нужен только ради причины отказа: сколько
   * партии осталось, ему говорит зовущий, а вот назвать в причине настоящую
   * цифру потолка можно только зная её.
   */
  private readonly batchQuotaBytes: number;

  constructor(
    private readonly storage: MusicStorageService,
    config: ConfigService,
  ) {
    const raw = Number(config.get<string>('MUSIC_MAX_UPLOAD_BYTES'));
    this.maxBytes =
      Number.isFinite(raw) && raw > 0
        ? raw
        : MUSIC_UPLOAD_DEFAULT_LIMITS.maxBytes;

    const quota = Number(config.get<string>('MUSIC_INGEST_BATCH_QUOTA_BYTES'));
    this.batchQuotaBytes =
      Number.isFinite(quota) && quota > 0
        ? quota
        : MUSIC_INGEST_DEFAULT_BATCH_QUOTA_BYTES;
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
   * Разобрать архив, лежащий в бакете, и разложить его записи туда же по
   * одной.
   *
   * Архив нигде не существует целиком: `unzipper.Parse` читает поток из S3
   * на лету, каждая взятая запись тем же потоком уходит обратно в бакет.
   * Ни временного файла, ни `Buffer.concat` — четыре гигабайта, поднятые в
   * память ради удобства, роняют API вернее любой ошибки в правилах.
   *
   * Три исхода записи, и разница между ними принципиальна:
   *
   * - `take` — аудио: льём и заводим позицию;
   * - `skip` — обложка, текст, мусор macOS, вложенный архив, каталог:
   *   `autodrain()` и молчание. Чужой архив всегда содержит лишнее, и падать
   *   на `cover.jpg` нельзя;
   * - `reject` — путь наружу или переполнение потолков самого архива: разбор
   *   останавливается целиком, а позиция архива падает с причиной словами.
   *   На `../` падать обязательно.
   *
   * Отдельно от `reject` стоит потолок **партии**: он не про архив и не про
   * запись. Место кончилось у партии, и взятые до этого дорожки ни в чём не
   * виноваты — разбор кончается, взятое остаётся, а в `truncatedReason`
   * уходит пометка словами.
   *
   * Каждая взятая запись уходит в `onEntry` сразу после заливки — списком в
   * конце их не собрать: сбой между заливкой и записью в базу оставил бы
   * полный комплект объектов, о которых не знает никто. Порядок вызовов —
   * тот, в каком записи лежали в архиве; порядок альбома выстраивает
   * обработка потом, по номерам из тегов, которых до разбора не знает никто.
   */
  async expandArchive(
    batchId: string,
    archiveKey: string,
    remainingBatchBytes: number,
    onEntry: ArchiveEntrySink,
  ): Promise<ExpandedArchive> {
    if (!this.storage.configured) {
      throw new IngestFetchError('unreachable', 'Хранилище не настроено');
    }

    const source = await this.storage.getStream(archiveKey);
    if (!source) {
      throw this.reject('unreachable', 'Архив не читается из хранилища');
    }

    const zip = ParseZip({ forceStream: true });
    // Ошибка чтения из S3 иначе останется без слушателя и уронит процесс, а
    // цикл ниже будет ждать записей, которых уже не будет.
    source.on('error', (error) => zip.destroy(error));
    source.pipe(zip);

    // Тот же срок, что и у скачивания по ссылке, и по той же причине: без
    // него архив, чтение которого зависло, держит позицию до порога
    // «зависших» и получает вторую распаковку поверх первой.
    const timer = setTimeout(() => {
      zip.destroy(new Error('Разбор архива не уложился в срок'));
    }, FETCH_TIMEOUT_MS);
    timer.unref?.();

    const seen: IngestZipSeen = { count: 0, totalBytes: 0 };
    let takenCount = 0;
    let truncatedReason: string | null = null;

    try {
      for await (const entry of zip as unknown as AsyncIterable<ZipEntry>) {
        const path = entry.path ?? '';
        const declared = declaredEntrySize(entry);
        const verdict = acceptZipEntry({ path, sizeBytes: declared }, seen);

        if (verdict === 'reject') {
          // Причину складывает тот же модуль, что вынес вердикт: разъедься
          // они, админ читал бы «не удалось» вместо «путь наружу».
          throw this.reject(
            'zip_rejected',
            zipRejectionReason({ path, sizeBytes: declared }, seen),
          );
        }

        if (verdict === 'skip') {
          // Запись всё равно надо дочитать: пока её поток не кончился,
          // разбор стоит на месте.
          await entry.autodrain().promise();
          continue;
        }

        // Предел записи — меньший из трёх: свой потолок файла, остаток
        // партии и остаток распакованного объёма архива. Кто именно из них
        // ближе, решает и то, чем кончится перебор.
        const budget = ingestEntryBudget({
          fileBytes: this.maxBytes,
          batchBytes: remainingBatchBytes - seen.totalBytes,
          archiveBytes: INGEST_ZIP_MAX_TOTAL_BYTES - seen.totalBytes,
        });
        // Остаток партии выбран целиком: следующей записи места нет, и
        // читать архив дальше незачем. Взятое до этого остаётся.
        if (budget.batchExhausted) {
          truncatedReason = ingestBatchLimitNotice(
            takenCount,
            this.batchQuotaBytes,
          );
          break;
        }

        let stored: ExtractedArchiveEntry;
        try {
          stored = await this.storeEntry(batchId, entry, path, budget);
        } catch (error) {
          // Запись не влезла в остаток партии — это не отказ архиву, а конец
          // разбора: её собственный обрывок `storeEntry` уже убрал, а взятые
          // раньше дорожки остаются в партии.
          if (
            error instanceof IngestFetchError &&
            error.rejection === 'batch_full'
          ) {
            truncatedReason = ingestBatchLimitNotice(
              takenCount,
              this.batchQuotaBytes,
            );
            break;
          }
          throw error;
        }

        try {
          await onEntry(stored);
        } catch (error) {
          // Позиция не завелась — объект без строки в базе не нужен никому
          // и найтись потом не сможет.
          await this.storage.remove(stored.storageKey);
          throw error;
        }

        takenCount += 1;
        seen.count += 1;
        seen.totalBytes += stored.sizeBytes;
      }
    } catch (error) {
      // Взятое до сбоя остаётся: позиции по этим объектам уже заведены, и
      // стереть их значило бы оставить в партии строки, ведущие в пустоту.
      source.destroy();
      if (!zip.destroyed) zip.destroy();
      if (error instanceof IngestFetchError) throw error;
      this.logger.warn(`Архив ${archiveKey} не разобрался: ${String(error)}`);
      throw this.reject('unreachable', 'Не удалось разобрать архив');
    } finally {
      clearTimeout(timer);
    }

    return { takenCount, truncatedReason };
  }

  /**
   * Одна запись архива — в бакет потоком.
   *
   * Превышение предела рвёт разбор целиком, а не только эту запись: брошенный
   * на середине поток записи всё равно валит разбор — `unzipper` читает архив
   * последовательно и хвост пропущенной записи не перескочит. Заявленный
   * размер из заголовка тут не помощник: у архива, собранного потоком, он
   * ноль.
   */
  private async storeEntry(
    batchId: string,
    entry: ZipEntry,
    path: string,
    budget: IngestEntryBudget,
  ): Promise<ExtractedArchiveEntry> {
    const mime = mimeForEntry(path);
    const key = this.storage.buildIngestKey(batchId, extensionFor(mime));
    const meter = new IngestByteMeter(budget.limitBytes);
    const sink = new PassThrough();
    const upload = this.storage.putStream(key, sink, mime);
    // До конца записи отказ заливки ловить некому, а необработанное
    // отклонение промиса в Node роняет процесс. Настоящую ошибку достанем
    // ниже, из `await upload`.
    upload.catch(() => undefined);

    try {
      for await (const chunk of entry) {
        if (!meter.push(chunk)) {
          sink.destroy(new Error('Превышен предел размера'));
          // Две разные новости: запись переросла свой потолок — виновата
          // запись; партия выбрала свой — виноват размер партии, и разбор
          // на этом честно кончается, не трогая взятого раньше.
          throw budget.kind === 'batch'
            ? this.batchFull()
            : this.reject(
                'zip_rejected',
                `Запись «${path}» больше ${formatBytesLimit(budget.limitBytes)}`,
              );
        }
        // Обратное давление: без ожидания `drain` распаковщик набьёт буфер
        // теми самыми мегабайтами, которых мы избегали.
        if (!sink.write(chunk)) await once(sink, 'drain');
      }
      sink.end();
      await upload;
    } catch (error) {
      if (!sink.destroyed) sink.destroy();
      await this.storage.remove(key);
      throw error;
    }

    if (meter.sizeBytes === 0) {
      await this.storage.remove(key);
      throw this.reject('zip_rejected', `Запись «${path}» пустая`);
    }

    return {
      entryPath: path,
      storageKey: key,
      sizeBytes: meter.sizeBytes,
      checksum: meter.checksum,
      mime,
    };
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
    const budget = ingestEntryBudget({
      fileBytes: this.maxBytes,
      batchBytes: remainingBatchBytes,
      archiveBytes: Number.POSITIVE_INFINITY,
    });
    // Места в партии не осталось вовсе — качать нечего и незачем: иначе
    // отказ звучал бы «Файл больше 0 МБ», то есть враньём про обе величины.
    if (budget.batchExhausted) {
      await response.body?.cancel().catch(() => undefined);
      throw this.batchFull();
    }

    if (!response.body) {
      throw this.reject('empty_body');
    }

    const key = this.storage.buildIngestKey(batchId, extensionFor(mime));
    const meter = new IngestByteMeter(budget.limitBytes);
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
          // «Файл больше 150 МБ» и «партия переполнена» — разные новости, и
          // называются они разными словами, а не одной строкой, в которую
          // подставили чужую цифру.
          throw budget.kind === 'batch'
            ? this.batchFull()
            : this.reject('too_large', formatBytesLimit(budget.limitBytes));
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

  /**
   * Партии больше нечего дать. Причина называет настоящий потолок партии, а
   * не остаток: «осталось 0 МБ» админу не говорит ничего, а «упёрлась в
   * потолок 20 ГБ» говорит, что делать дальше.
   */
  private batchFull(): IngestFetchError {
    return this.reject('batch_full', formatBytesLimit(this.batchQuotaBytes));
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

/**
 * Ровно та часть записи `unzipper`, которой мы пользуемся. Своим типом,
 * потому что `@types/unzipper` описывает `Parse` как поток без объектной
 * читающей стороны, а с `forceStream` записи приходят именно оттуда.
 */
interface ZipEntry extends AsyncIterable<Uint8Array> {
  path: string;
  type: string;
  vars?: { uncompressedSize?: number };
  extra?: { uncompressedSize?: number };
  autodrain(): { promise(): Promise<void> };
}

/**
 * Сколько запись обещает весить в распакованном виде.
 *
 * Обещание, а не факт: у архива, собранного потоком, в заголовке записи
 * стоят нули, а настоящий размер приходит уже после данных. Число идёт
 * только в потолки числа записей и объёма — фактически принятое считает
 * `IngestByteMeter`.
 */
function declaredEntrySize(entry: ZipEntry): number {
  const zip64 = entry.extra?.uncompressedSize;
  if (typeof zip64 === 'number' && zip64 > 0) return zip64;
  const declared = entry.vars?.uncompressedSize;
  return typeof declared === 'number' && declared > 0 ? declared : 0;
}

/** Тип записи архива по её расширению: других подсказок у нас нет. */
function mimeForEntry(path: string): string {
  return path.toLowerCase().endsWith('.m4a') ? 'audio/mp4' : 'audio/mpeg';
}
