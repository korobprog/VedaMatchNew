import { createHash, type Hash } from 'node:crypto';
import { checkIngestUrl, INGEST_MAX_REDIRECTS } from './ingest-url-guard';

/**
 * Правила скачивания по ссылке, которые проверяются без сокета.
 *
 * Тем же приёмом, что `ingest-url-guard.ts` и `ingest-process-rules.ts`:
 * сам загрузчик ходит в сеть, DNS и S3, и тестировать его обёртку незачем,
 * а вот решения «пора рвать поток», «это не аудио» и «куда ведёт `Location`»
 * — чистые, и ошибка в каждом тихая. Счётчик, промахнувшийся на единицу,
 * выглядит как работающий ровно до того дня, когда кто-то подсунет ссылку
 * на образ диска.
 */

/**
 * Причина, по которой скачивание не состоялось. Строки собираются здесь же:
 * они видны админу в колонке таблицы, и склеивать их по месту — верный
 * способ получить в базе три разных формулировки одного отказа.
 */
export type IngestFetchRejection =
  | 'malformed'
  | 'scheme_not_allowed'
  | 'private_address'
  | 'too_many_redirects'
  | 'redirect_without_location'
  | 'not_audio'
  | 'too_large'
  /**
   * Партия выбрала свой потолок объёма. Не то же, что `too_large`: файл тут
   * ни при чём, места нет у партии — и вторая попытка ничего не изменит,
   * пока партию не опубликуют и не заведут следующую.
   */
  | 'batch_full'
  | 'empty_body'
  | 'http_error'
  | 'unreachable'
  /**
   * Разбор архива остановлен: путь наружу или переполнение потолков.
   * Причина словами приходит от `zipRejectionReason` — здесь только вердикт
   * «повторять нечего».
   */
  | 'zip_rejected';

/**
 * Отказы, которые не пройдут и со второй попытки: адрес не изменится, тип
 * содержимого тоже. Повторять их значит трижды сходить за тем же ответом.
 */
const TERMINAL: ReadonlySet<IngestFetchRejection> =
  new Set<IngestFetchRejection>([
    'malformed',
    'scheme_not_allowed',
    'private_address',
    'too_many_redirects',
    'redirect_without_location',
    'not_audio',
    'too_large',
    'batch_full',
    'zip_rejected',
  ]);

export function isRetryableRejection(rejection: IngestFetchRejection): boolean {
  return !TERMINAL.has(rejection);
}

/** Причина отказа словами — ровно та строка, что ляжет в `failureReason`. */
export function ingestFetchReason(
  rejection: IngestFetchRejection,
  detail?: string | number,
): string {
  switch (rejection) {
    case 'malformed':
      return 'Это не похоже на адрес';
    case 'scheme_not_allowed':
      return 'Скачивать умеем только по http и https';
    case 'private_address':
      return 'Адрес ведёт во внутреннюю сеть';
    case 'too_many_redirects':
      return `Слишком много пересылок (больше ${INGEST_MAX_REDIRECTS})`;
    case 'redirect_without_location':
      return 'Сервер отправил на пересылку, но не сказал куда';
    case 'not_audio':
      return `Не аудио: ${detail ?? 'тип не назван'}`;
    case 'too_large':
      return `Файл больше ${detail ?? 'предела'}`;
    case 'batch_full':
      return `Партия упёрлась в потолок ${detail ?? 'объёма'} — опубликуйте её и заведите следующую`;
    case 'empty_body':
      return 'Сервер отдал пустой файл';
    case 'zip_rejected':
      return String(detail ?? 'Архив не разобрать');
    case 'http_error':
      return `Сервер ответил ${detail ?? 'ошибкой'}`;
    case 'unreachable':
    default:
      return 'Сервер не отвечает';
  }
}

/** «150 МБ» для причины отказа: байты в таблице админ читать не станет. */
export function formatBytesLimit(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  if (mb >= 1024) {
    return `${Math.round((mb / 1024) * 10) / 10} ГБ`.replace('.', ',');
  }
  return `${Math.round(mb)} МБ`;
}

/** Чей потолок оказался ближе всех к записи. */
export type IngestLimitKind = 'file' | 'batch' | 'archive';

export interface IngestEntryBudget {
  /** Сколько байт записи разрешено принять. */
  limitBytes: number;
  /** Ближайший потолок — его и называем в причине отказа. */
  kind: IngestLimitKind;
  /** Партии больше нечего дать: приём пора кончать, а не рвать по нулю. */
  batchExhausted: boolean;
}

/**
 * Сколько байт разрешено принять и обо что позиция споткнётся первым.
 *
 * Вынесено сюда из загрузчика, потому что «меньший из трёх» — это не одна
 * арифметика, а два разных исхода. Файл, переросший **свой** потолок, —
 * отказ записи: она одна и виновата. Партия, выбравшая **свой**, — не
 * отказ записи вовсе: место кончилось у партии, и остальные дорожки архива
 * ни при чём.
 *
 * Различать их обязательно: пока предел считался просто минимумом,
 * выбранный остаток партии превращался в нулевой предел, и первый же байт
 * следующей записи получал «Запись «03.mp3» больше 0 МБ» — цифру, которой
 * нет ни у файла, ни у партии, — после чего разбор стирал из бакета всё уже
 * распакованное.
 */
export function ingestEntryBudget(budgets: {
  fileBytes: number;
  batchBytes: number;
  archiveBytes: number;
}): IngestEntryBudget {
  const batchBytes = Math.max(0, budgets.batchBytes);
  const archiveBytes = Math.max(0, budgets.archiveBytes);

  // Порядок сравнений задаёт и разрешение ничьей: при равных остатках
  // виноватым считается файл, а не партия. Партия «упёрлась» только тогда,
  // когда её остаток строго меньше всех прочих пределов.
  let kind: IngestLimitKind = 'file';
  let limitBytes = Math.max(0, budgets.fileBytes);
  if (archiveBytes < limitBytes) {
    limitBytes = archiveBytes;
    kind = 'archive';
  }
  if (batchBytes < limitBytes) {
    limitBytes = batchBytes;
    kind = 'batch';
  }

  return { limitBytes, kind, batchExhausted: batchBytes <= 0 };
}

/**
 * Пометка о разборе, прерванном потолком партии.
 *
 * Числа настоящие: сколько записей успело попасть в партию и какой именно
 * потолок её остановил. Уже вынутые дорожки при этом остаются — стирать их
 * значит наказывать редакцию за то, что архив оказался больше остатка.
 */
/**
 * Пометка о разборе, оборвавшемся на полпути по сбою.
 *
 * Позиции по уже вынутым записям к этому моменту заведены, и повторять
 * разбор нельзя: вторая распаковка залила бы те же дорожки новыми ключами, а
 * первый комплект остался бы в партии вторым экземпляром. Поэтому пометка
 * говорит, сколько записей всё-таки вошло, — остальное человек добирает сам.
 */
export function ingestArchiveBreakNotice(takenCount: number): string {
  return `Разбор прерван: в партию заведено записей ${takenCount}`;
}

export function ingestBatchLimitNotice(
  takenCount: number,
  quotaBytes: number,
): string {
  const quota = formatBytesLimit(quotaBytes);
  return takenCount > 0
    ? `Взято записей: ${takenCount}. Дальше партия упёрлась в потолок ${quota}`
    : `Партия упёрлась в потолок ${quota} — не поместилась ни одна запись архива`;
}


/**
 * Счётчик принятых байтов с MD5 на лету.
 *
 * Считаем **фактически принятое**, а не `Content-Length`: тот заголовок —
 * заявление сервера, и ничто не мешает ему обещать килобайт, а гнать
 * гигабайты. Единственный способ не набрать лишнего — держать счётчик на
 * каждом куске и рвать поток, как только он перевалил за предел.
 *
 * MD5, а не SHA-256, по одной причине: у объекта, залитого одним куском, S3
 * отдаёт в ETag ровно MD5, и редакционная позиция сходится по сумме с личной
 * загрузкой, у которой сумма взята из ETag. Это отпечаток содержимого для
 * поиска дублей, а не защита: подобрать коллизию MD5 сегодня умеет любой
 * студент, и полагаться на него как на подпись нельзя.
 */
export class IngestByteMeter {
  private readonly hash: Hash = createHash('md5');
  private received = 0;
  private digest: string | null = null;

  constructor(private readonly limitBytes: number) {}

  /**
   * Принять кусок. `true` — можно продолжать, `false` — предел перейдён и
   * поток пора рвать.
   *
   * Строго «больше», а не «не меньше»: файл ровно в предел законен, и
   * отказать ему значит уронить единственную запись, которую админ мерил
   * линейкой из этих же правил.
   */
  push(chunk: Uint8Array): boolean {
    this.received += chunk.byteLength;
    if (this.received > this.limitBytes) return false;
    this.hash.update(chunk);
    return true;
  }

  get sizeBytes(): number {
    return this.received;
  }

  /** MD5 всего принятого. Считается один раз: `digest()` необратим. */
  get checksum(): string {
    if (this.digest === null) this.digest = this.hash.digest('hex');
    return this.digest;
  }
}

/** Что сказал сервер о типе содержимого. */
export type ContentTypeVerdict =
  | {
      ok: true;
      /**
       * Разобранный тип или `null`, если сервер ничего внятного не сказал:
       * тогда тип уточняется по тегам уже после скачивания.
       */
      mime: string | null;
    }
  | { ok: false; declared: string };

const ACCEPTED_MIME = new Set(['audio/mpeg', 'audio/mp4']);

/**
 * Типы, которые означают «сервер не знает, что отдаёт». Отказывать по ним
 * нельзя: половина файловых хостингов отдаёт mp3 именно так, и запрет
 * оставил бы ручку без применения. Настоящую проверку делает разбор тегов
 * после скачивания — там на руках байты, а не обещание.
 */
const UNKNOWN_MIME = new Set([
  'application/octet-stream',
  'binary/octet-stream',
  'application/binary',
]);

/**
 * Сверка `Content-Type`.
 *
 * Отсутствие заголовка — не отказ: он необязателен, и запись, отданная без
 * него, ничем не хуже. А вот `text/html` — отказ немедленный: это страница
 * входа, капча или «файл удалён», и качать её сто мегабайт незачем.
 */
export function checkContentType(
  header: string | null | undefined,
): ContentTypeVerdict {
  const raw = (header ?? '').trim();
  if (raw.length === 0) return { ok: true, mime: null };

  // `audio/mpeg; charset=binary` — законная запись: параметры после точки с
  // запятой к типу отношения не имеют, а сравнение целой строки их не ждёт.
  const mime = raw.split(';')[0].trim().toLowerCase();
  if (mime.length === 0) return { ok: true, mime: null };
  if (ACCEPTED_MIME.has(mime)) return { ok: true, mime };
  if (UNKNOWN_MIME.has(mime)) return { ok: true, mime: null };
  return { ok: false, declared: mime };
}

const MIME_BY_EXTENSION: Record<string, string> = {
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  mp4: 'audio/mp4',
  m4b: 'audio/mp4',
};

/**
 * Чем считать скачанное, когда сервер типа не назвал.
 *
 * Порядок такой: слово сервера, потом расширение в пути, потом `audio/mpeg`
 * как самое частое. Тип нужен не для галочки — по нему выбирается расширение
 * ключа в бакете, а обработка потом читает тип обратно из ключа
 * (`mimeFromStorageKey`). Промах здесь означает запись без длительности.
 */
export function resolveIngestMime(
  declaredMime: string | null,
  url: string,
): string {
  if (declaredMime && ACCEPTED_MIME.has(declaredMime)) return declaredMime;

  let pathname = '';
  try {
    pathname = new URL(url).pathname;
  } catch {
    pathname = '';
  }
  const name = pathname.split('/').pop() ?? '';
  const dot = name.lastIndexOf('.');
  if (dot > 0) {
    const guess = MIME_BY_EXTENSION[name.slice(dot + 1).toLowerCase()];
    if (guess) return guess;
  }
  return 'audio/mpeg';
}

/** Коды, после которых надо идти по `Location`, а не читать тело. */
const REDIRECT_CODES = new Set([301, 302, 303, 307, 308]);

export function isRedirectStatus(status: number): boolean {
  return REDIRECT_CODES.has(status);
}

export type RedirectOutcome =
  { ok: true; url: string } | { ok: false; rejection: IngestFetchRejection };

/**
 * Куда ведёт `Location` и можно ли туда идти.
 *
 * Три вещи разом, потому что порознь их легко забыть:
 *
 * 1. `Location` бывает относительным (`/files/a.mp3`) — его разворачиваем
 *    от текущего адреса, а не от корня.
 * 2. Считаем пересылки: `INGEST_MAX_REDIRECTS` и стоп. Дальше либо петля,
 *    либо площадка, которая нас не ждёт.
 * 3. **Новый адрес проверяется заново.** Это главное: внешний сайт одним
 *    `302` на `http://169.254.169.254/` уводит наш сервер к метаданным
 *    облака, и проверка, сделанная один раз перед первым запросом, этого не
 *    видит. Резолв имени делает загрузчик — тоже на каждом шаге.
 */
export function resolveRedirect(
  currentUrl: string,
  location: string | null | undefined,
  redirectsDone: number,
): RedirectOutcome {
  if (redirectsDone >= INGEST_MAX_REDIRECTS) {
    return { ok: false, rejection: 'too_many_redirects' };
  }

  const raw = (location ?? '').trim();
  if (raw.length === 0) {
    return { ok: false, rejection: 'redirect_without_location' };
  }

  let next: URL;
  try {
    next = new URL(raw, currentUrl);
  } catch {
    return { ok: false, rejection: 'malformed' };
  }

  const rejection = checkIngestUrl(next.toString());
  if (rejection) return { ok: false, rejection };

  return { ok: true, url: next.toString() };
}
