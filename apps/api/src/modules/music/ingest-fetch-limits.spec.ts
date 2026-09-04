import { createHash } from 'node:crypto';
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
} from './ingest-fetch-limits';
import { INGEST_MAX_REDIRECTS } from './ingest-url-guard';

const bytes = (count: number, fill = 0x61): Uint8Array =>
  new Uint8Array(count).fill(fill);

describe('IngestByteMeter: предел', () => {
  it('файл ровно в предел проходит: граница законна', () => {
    const meter = new IngestByteMeter(100);
    expect(meter.push(bytes(60))).toBe(true);
    expect(meter.push(bytes(40))).toBe(true);
    expect(meter.sizeBytes).toBe(100);
  });

  it('первый же лишний байт обрывает поток', () => {
    const meter = new IngestByteMeter(100);
    expect(meter.push(bytes(100))).toBe(true);
    expect(meter.push(bytes(1))).toBe(false);
  });

  it('кусок, перешагнувший предел целиком, тоже обрывает', () => {
    // Кусок приходит размером, который выбрал не мы: ловить надо не ровное
    // попадание в предел, а факт превышения.
    const meter = new IngestByteMeter(100);
    expect(meter.push(bytes(150))).toBe(false);
  });

  it('нулевой предел не пропускает ничего, кроме пустоты', () => {
    const meter = new IngestByteMeter(0);
    expect(meter.push(bytes(0))).toBe(true);
    expect(meter.push(bytes(1))).toBe(false);
  });
});

describe('IngestByteMeter: контрольная сумма', () => {
  it('MD5 считается по всему содержимому, а не по последнему куску', () => {
    const meter = new IngestByteMeter(1024);
    meter.push(Buffer.from('харе '));
    meter.push(Buffer.from('кришна'));

    expect(meter.checksum).toBe(
      createHash('md5').update('харе кришна').digest('hex'),
    );
    expect(meter.sizeBytes).toBe(Buffer.byteLength('харе кришна'));
  });

  it('сумма читается повторно тем же значением', () => {
    // `digest()` необратим: второе обращение к нему бросило бы исключение
    // ровно в том месте, где сумму пишут в базу.
    const meter = new IngestByteMeter(1024);
    meter.push(Buffer.from('om'));
    expect(meter.checksum).toBe(meter.checksum);
  });

  it('пустой поток даёт MD5 пустоты, а не пустую строку', () => {
    const meter = new IngestByteMeter(1024);
    expect(meter.checksum).toBe(createHash('md5').digest('hex'));
  });
});

describe('checkContentType', () => {
  it('принимает аудио с параметрами после точки с запятой', () => {
    expect(checkContentType('audio/mpeg; charset=binary')).toEqual({
      ok: true,
      mime: 'audio/mpeg',
    });
    expect(checkContentType('AUDIO/MP4')).toEqual({
      ok: true,
      mime: 'audio/mp4',
    });
  });

  it('отвергает страницу вместо файла', () => {
    expect(checkContentType('text/html')).toEqual({
      ok: false,
      declared: 'text/html',
    });
    expect(checkContentType('text/html; charset=utf-8')).toEqual({
      ok: false,
      declared: 'text/html',
    });
  });

  it('отсутствие заголовка — не отказ: тип уточнится по тегам', () => {
    expect(checkContentType(null)).toEqual({ ok: true, mime: null });
    expect(checkContentType(undefined)).toEqual({ ok: true, mime: null });
    expect(checkContentType('   ')).toEqual({ ok: true, mime: null });
  });

  it('«не знаю, что отдаю» — тоже не отказ', () => {
    expect(checkContentType('application/octet-stream')).toEqual({
      ok: true,
      mime: null,
    });
  });
});

describe('resolveIngestMime', () => {
  it('слово сервера сильнее пути', () => {
    expect(resolveIngestMime('audio/mp4', 'https://ex.org/a.mp3')).toBe(
      'audio/mp4',
    );
  });

  it('сервер промолчал — берём расширение из пути', () => {
    expect(resolveIngestMime(null, 'https://ex.org/files/a.m4a?x=1')).toBe(
      'audio/mp4',
    );
  });

  it('ни типа, ни расширения — mp3 как самое частое', () => {
    expect(resolveIngestMime(null, 'https://ex.org/download/1234')).toBe(
      'audio/mpeg',
    );
  });
});

describe('resolveRedirect', () => {
  const from = 'https://ex.org/music/list';

  it('относительный Location разворачивается в абсолютный', () => {
    expect(resolveRedirect(from, '/files/a.mp3', 0)).toEqual({
      ok: true,
      url: 'https://ex.org/files/a.mp3',
    });
    // Относительный без ведущей косой считается от текущего каталога.
    expect(resolveRedirect(from, 'a.mp3', 0)).toEqual({
      ok: true,
      url: 'https://ex.org/music/a.mp3',
    });
  });

  it('абсолютный Location берётся как есть', () => {
    expect(resolveRedirect(from, 'https://cdn.ex.org/a.mp3', 1)).toEqual({
      ok: true,
      url: 'https://cdn.ex.org/a.mp3',
    });
  });

  it('четвёртый редирект — отказ', () => {
    expect(INGEST_MAX_REDIRECTS).toBe(3);
    expect(resolveRedirect(from, 'https://ex.org/3', 2)).toEqual({
      ok: true,
      url: 'https://ex.org/3',
    });
    expect(resolveRedirect(from, 'https://ex.org/4', 3)).toEqual({
      ok: false,
      rejection: 'too_many_redirects',
    });
  });

  it('пересылка во внутреннюю сеть отбивается на каждом шаге', () => {
    // Ради этого проверка и повторяется: внешний сайт одним 302 уводит нас к
    // метаданным облака, и разовой проверки перед первым запросом мало.
    expect(
      resolveRedirect(from, 'http://169.254.169.254/latest/meta', 0),
    ).toEqual({ ok: false, rejection: 'private_address' });
    expect(resolveRedirect(from, 'http://127.0.0.1:4000/health', 0)).toEqual({
      ok: false,
      rejection: 'private_address',
    });
    // Относительный путь тоже разворачивается и проверяется, а не пропускается.
    expect(resolveRedirect('https://ex.org/a', '//localhost/b', 0)).toEqual({
      ok: false,
      rejection: 'private_address',
    });
  });

  it('чужая схема в Location не проходит', () => {
    expect(resolveRedirect(from, 'file:///etc/passwd', 0)).toEqual({
      ok: false,
      rejection: 'scheme_not_allowed',
    });
  });

  it('пересылка без Location — отказ, а не молчаливая остановка', () => {
    expect(resolveRedirect(from, null, 0)).toEqual({
      ok: false,
      rejection: 'redirect_without_location',
    });
    expect(resolveRedirect(from, '  ', 0)).toEqual({
      ok: false,
      rejection: 'redirect_without_location',
    });
  });
});

describe('isRedirectStatus', () => {
  it('знает все коды пересылки, включая 307 и 308', () => {
    for (const code of [301, 302, 303, 307, 308]) {
      expect(isRedirectStatus(code)).toBe(true);
    }
    expect(isRedirectStatus(200)).toBe(false);
    expect(isRedirectStatus(304)).toBe(false);
  });
});

describe('причины отказа', () => {
  it('пишутся словами, которые админ прочитает в таблице', () => {
    expect(ingestFetchReason('private_address')).toBe(
      'Адрес ведёт во внутреннюю сеть',
    );
    expect(ingestFetchReason('http_error', 404)).toBe('Сервер ответил 404');
    expect(ingestFetchReason('not_audio', 'text/html')).toBe(
      'Не аудио: text/html',
    );
    expect(ingestFetchReason('too_large', '150 МБ')).toBe('Файл больше 150 МБ');
    expect(ingestFetchReason('unreachable')).toBe('Сервер не отвечает');
    // Потолок партии — не размер файла: «файл больше 0 МБ» врёт про обе
    // величины сразу.
    expect(ingestFetchReason('batch_full', '20 ГБ')).toBe(
      'Партия упёрлась в потолок 20 ГБ — опубликуйте её и заведите следующую',
    );
    // У архива причина приходит готовой строкой: правило, обо что он
    // споткнулся, знает только разбор.
    expect(ingestFetchReason('zip_rejected', 'В архиве больше 200 записей')).toBe(
      'В архиве больше 200 записей',
    );
  });

  it('приговор не повторяется, сбой связи повторяется', () => {
    expect(isRetryableRejection('private_address')).toBe(false);
    expect(isRetryableRejection('not_audio')).toBe(false);
    expect(isRetryableRejection('too_large')).toBe(false);
    expect(isRetryableRejection('zip_rejected')).toBe(false);
    // Пока партию не опубликуют, места в ней не прибавится.
    expect(isRetryableRejection('batch_full')).toBe(false);
    expect(isRetryableRejection('unreachable')).toBe(true);
    expect(isRetryableRejection('http_error')).toBe(true);
  });
});

describe('formatBytesLimit', () => {
  it('переводит предел в мегабайты для строки отказа', () => {
    expect(formatBytesLimit(150 * 1024 * 1024)).toBe('150 МБ');
    expect(formatBytesLimit(20 * 1024 * 1024 * 1024)).toBe('20 ГБ');
  });
});

const mb = (count: number): number => count * 1024 * 1024;

describe('ingestEntryBudget', () => {
  it('берёт ближайший потолок и называет, чей он', () => {
    expect(
      ingestEntryBudget({
        fileBytes: mb(150),
        batchBytes: mb(4000),
        archiveBytes: mb(4000),
      }),
    ).toEqual({ limitBytes: mb(150), kind: 'file', batchExhausted: false });

    expect(
      ingestEntryBudget({
        fileBytes: mb(150),
        batchBytes: mb(40),
        archiveBytes: mb(4000),
      }),
    ).toEqual({ limitBytes: mb(40), kind: 'batch', batchExhausted: false });

    expect(
      ingestEntryBudget({
        fileBytes: mb(150),
        batchBytes: mb(4000),
        archiveBytes: mb(20),
      }),
    ).toEqual({ limitBytes: mb(20), kind: 'archive', batchExhausted: false });
  });

  it('выбранный до конца остаток партии — не нулевой предел, а стоп', () => {
    // Ровно этим кончалась партия, упёршаяся в потолок на середине архива:
    // предел становился нулём, и первый же байт следующей записи получал
    // «Запись «03.mp3» больше 0 МБ» — цифру, которой нет ни у файла, ни у
    // партии.
    const budget = ingestEntryBudget({
      fileBytes: mb(150),
      batchBytes: 0,
      archiveBytes: mb(4000),
    });
    expect(budget.batchExhausted).toBe(true);
    expect(budget.limitBytes).toBe(0);
  });

  it('перебранный остаток считается выбранным, а не отрицательным', () => {
    const budget = ingestEntryBudget({
      fileBytes: mb(150),
      batchBytes: -mb(7),
      archiveBytes: mb(4000),
    });
    expect(budget).toEqual({
      limitBytes: 0,
      kind: 'batch',
      batchExhausted: true,
    });
  });

  it('бесконечный остаток партии не мешает: у ссылки без партии так и есть', () => {
    expect(
      ingestEntryBudget({
        fileBytes: mb(150),
        batchBytes: Number.POSITIVE_INFINITY,
        archiveBytes: Number.POSITIVE_INFINITY,
      }),
    ).toEqual({ limitBytes: mb(150), kind: 'file', batchExhausted: false });
  });
});

describe('ingestBatchLimitNotice', () => {
  it('называет настоящие числа: сколько взято и обо что упёрлись', () => {
    expect(ingestBatchLimitNotice(12, 20 * 1024 * 1024 * 1024)).toBe(
      'Взято записей: 12. Дальше партия упёрлась в потолок 20 ГБ',
    );
  });

  it('не влезло ничего — говорит и это', () => {
    expect(ingestBatchLimitNotice(0, 20 * 1024 * 1024 * 1024)).toBe(
      'Партия упёрлась в потолок 20 ГБ — не поместилась ни одна запись архива',
    );
  });
});
