import { ApiError } from '@/lib/api/client';
import { describeInboxError, describeInboxMoreError } from './inbox-error';

/**
 * Раунд оценки 001, дефект 2: в офлайне на экран уходило
 * `java.net.UnknownHostException` как есть.
 */
describe('describeInboxError', () => {
  it('сетевой сбой без ответа сервера — по-русски, без java-исключения', () => {
    const offline = new TypeError(
      'fetch failed: java.net.UnknownHostException: Unable to resolve host "api.vedamatch.ru": No address associated with hostname',
    );
    expect(describeInboxError(offline)).toBe('Нет соединения с сервером.');
    expect(describeInboxError(offline)).not.toMatch(/java|Exception|host/i);
  });

  it('не-ошибка тоже даёт человеческий текст, а не «undefined»', () => {
    expect(describeInboxError('что угодно')).toBe('Нет соединения с сервером.');
    expect(describeInboxError(null)).toBe('Нет соединения с сервером.');
    expect(describeInboxError(undefined)).toBe('Нет соединения с сервером.');
  });

  it('401 — сессия закончилась', () => {
    expect(describeInboxError(new ApiError(401, 'Unauthorized', null))).toBe(
      'Сессия закончилась. Войдите снова.',
    );
  });

  it('5xx — сервер недоступен', () => {
    expect(describeInboxError(new ApiError(500, 'Internal Server Error', null))).toBe(
      'Сервер временно недоступен. Попробуйте позже.',
    );
    expect(describeInboxError(new ApiError(503, 'Service Unavailable', null))).toBe(
      'Сервер временно недоступен. Попробуйте позже.',
    );
  });

  it('«нет связи» от самого клиента (status 0) сохраняет свой текст', () => {
    // `lib/api/client.ts` ставит его, когда обновить сессию не вышло из-за
    // сети; там текст подробнее общего и уже русский.
    expect(
      describeInboxError(new ApiError(0, 'Нет связи с сервером. Проверьте интернет и повторите.', null)),
    ).toBe('Нет связи с сервером. Проверьте интернет и повторите.');
  });

  it('прочие статусы — сообщение сервера, иначе свой текст раздела', () => {
    expect(describeInboxError(new ApiError(400, 'Неверный курсор', null))).toBe('Неверный курсор');
    expect(describeInboxError(new ApiError(404, '', null))).toBe(
      'Не удалось загрузить уведомления.',
    );
  });
});

describe('describeInboxMoreError', () => {
  it('беда та же, а действие другое — «продолжение», не «уведомления»', () => {
    expect(describeInboxMoreError(new ApiError(404, '', null))).toBe(
      'Не удалось загрузить продолжение.',
    );
    // Общие ветки те же самые.
    expect(describeInboxMoreError(new TypeError('Network request failed'))).toBe(
      'Нет соединения с сервером.',
    );
    expect(describeInboxMoreError(new ApiError(500, 'oops', null))).toBe(
      'Сервер временно недоступен. Попробуйте позже.',
    );
  });
});
