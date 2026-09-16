import { ApiError } from '@/lib/api/client';
import { describeServicesError } from './services-error';

describe('describeServicesError', () => {
  it('сетевой сбой без ответа сервера — «Нет соединения»', () => {
    expect(describeServicesError(new TypeError('Network request failed'))).toBe('Нет соединения с сервером.');
    expect(describeServicesError('что угодно не-ошибочное')).toBe('Нет соединения с сервером.');
  });

  it('401 — сессия закончилась', () => {
    expect(describeServicesError(new ApiError(401, 'Unauthorized', null))).toBe('Сессия закончилась. Войдите снова.');
  });

  it('5xx — сервер недоступен', () => {
    expect(describeServicesError(new ApiError(500, 'Internal Server Error', null))).toBe(
      'Сервер временно недоступен. Попробуйте позже.',
    );
    expect(describeServicesError(new ApiError(503, 'Service Unavailable', null))).toBe(
      'Сервер временно недоступен. Попробуйте позже.',
    );
  });

  it('прочие статусы — сообщение сервера, иначе общий текст', () => {
    expect(describeServicesError(new ApiError(400, 'Некорректный запрос', null))).toBe('Некорректный запрос');
    expect(describeServicesError(new ApiError(404, '', null))).toBe('Не удалось загрузить сервисы.');
  });
});
