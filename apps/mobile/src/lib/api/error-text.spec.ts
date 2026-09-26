import { ApiError } from './client';
import { errorText, isNetworkError, logErrorDetails, NETWORK_ERROR_TEXT, screenErrorText } from './error-text';

/**
 * Что человек читает на экране при ошибке. Повод — снимок с Realme: во
 * вкладке «Чаты» без сети стояло «fetch failed: java.net.UnknownHostException:
 * Unable to resolve host "api.vedamatch.ru"…».
 */

const FALLBACK = 'Не удалось загрузить беседы';

describe('isNetworkError', () => {
  it.each([
    ['fetch на Android (новый вид)', new TypeError('fetch failed: java.net.UnknownHostException: Unable to resolve host "api.vedamatch.ru": No address associated with hostname')],
    ['fetch на Android (старый вид)', new TypeError('Network request failed')],
    ['браузер Chrome', new TypeError('Failed to fetch')],
    ['браузер Safari', new TypeError('Load failed')],
    ['таймаут сокета', new Error('java.net.SocketTimeoutException: timeout')],
    ['недоверенный сертификат', new Error('Trust anchor for certification path not found')],
    ['прерванный запрос', Object.assign(new Error('Aborted'), { name: 'AbortError' })],
    ['клиент не смог обновить токен', new ApiError(0, 'Нет связи с сервером. Проверьте интернет и повторите.', null)],
  ])('%s — сеть', (_label, error) => {
    expect(isNetworkError(error)).toBe(true);
  });

  it.each([
    ['ответ сервера 404', new ApiError(404, 'Беседа не найдена', null)],
    ['ответ сервера 500', new ApiError(500, 'Internal server error', null)],
    ['своя ошибка приложения', new Error('Вход через Google или Яндекс недоступен внутри Telegram.')],
    ['не Error вовсе', 'строка'],
  ])('%s — не сеть', (_label, error) => {
    expect(isNetworkError(error)).toBe(false);
  });
});

describe('errorText', () => {
  it('сетевой сбой — человеческий текст, без java.net и адреса сервера', () => {
    const text = errorText(new TypeError('fetch failed: java.net.UnknownHostException: Unable to resolve host "api.vedamatch.ru"'), FALLBACK);
    expect(text).toBe(NETWORK_ERROR_TEXT);
    expect(text).not.toMatch(/java|api\.vedamatch|fetch/i);
  });

  it('текст сервера на 4xx сохраняется, без текста — запасной экрана', () => {
    expect(errorText(new ApiError(404, 'Беседа не найдена', null), FALLBACK)).toBe('Беседа не найдена');
    expect(errorText(new ApiError(400, '', null), FALLBACK)).toBe(FALLBACK);
  });

  it('5xx, 429 и 401 — свои тексты, внутренности сервера не показываются', () => {
    expect(errorText(new ApiError(502, 'Bad Gateway', null), FALLBACK)).toBe('Сервер временно недоступен. Попробуйте позже.');
    expect(errorText(new ApiError(429, 'ThrottlerException: Too Many Requests', null), FALLBACK)).toMatch(/Слишком много запросов/);
    expect(errorText(new ApiError(401, 'Unauthorized', null), FALLBACK)).toBe('Сессия закончилась. Войдите снова.');
  });

  it('своя ошибка приложения — её текст', () => {
    expect(errorText(new Error('Ссылка устарела'), FALLBACK)).toBe('Ссылка устарела');
  });

  it('пустая ошибка и не-Error — запасной текст экрана', () => {
    expect(errorText(new Error(''), FALLBACK)).toBe(FALLBACK);
    expect(errorText(undefined, FALLBACK)).toBe(FALLBACK);
  });
});

describe('подробности — в лог, не на экран', () => {
  let warn: jest.SpyInstance;
  beforeEach(() => {
    warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => warn.mockRestore());

  it('сетевой сбой пишется в лог с исходным текстом, на экран — человеческий', () => {
    const raw = 'fetch failed: java.net.UnknownHostException';
    expect(screenErrorText('app/(tabs)/index', new TypeError(raw), FALLBACK)).toBe(NETWORK_ERROR_TEXT);
    expect(warn).toHaveBeenCalledWith('[app/(tabs)/index]', `TypeError: ${raw}`);
  });

  it('обычный отказ сервера лог не засоряет', () => {
    logErrorDetails('x', new ApiError(404, 'Беседа не найдена', null));
    expect(warn).not.toHaveBeenCalled();
  });
});
