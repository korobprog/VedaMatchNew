import { ApiError } from '@/lib/api/client';
import { describeIdentitiesError } from './identities-error';

describe('describeIdentitiesError', () => {
  it('сетевой сбой без ответа сервера — «Нет соединения»', () => {
    expect(describeIdentitiesError(new TypeError('Network request failed'))).toBe(
      'Нет соединения с сервером.',
    );
    expect(describeIdentitiesError('что угодно не-ошибочное')).toBe('Нет соединения с сервером.');
  });

  it('401 — сессия закончилась', () => {
    expect(describeIdentitiesError(new ApiError(401, 'Unauthorized', null))).toBe(
      'Сессия закончилась. Войдите снова.',
    );
  });

  it('5xx — сервер недоступен', () => {
    expect(describeIdentitiesError(new ApiError(503, 'Service Unavailable', null))).toBe(
      'Сервер временно недоступен. Попробуйте позже.',
    );
  });

  it('400/409 — текст сервера как есть (последний способ, конфликт)', () => {
    expect(
      describeIdentitiesError(
        new ApiError(409, 'Это последний способ входа — отвязать его нельзя.', null),
      ),
    ).toBe('Это последний способ входа — отвязать его нельзя.');
    expect(describeIdentitiesError(new ApiError(404, '', null))).toBe('Не удалось выполнить действие.');
  });
});
