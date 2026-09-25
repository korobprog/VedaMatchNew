import { ApiError } from '@/lib/api/client';
import { describeUnionError, isNotFound } from './union-error';

describe('describeUnionError', () => {
  it('русскую фразу сервиса показывает как есть', () => {
    expect(describeUnionError(new ApiError(400, 'Внимание уже активно', null), 'Не вышло')).toBe('Внимание уже активно');
  });

  it('английский ответ Nest по умолчанию заменяет тем, что не вышло', () => {
    expect(describeUnionError(new ApiError(403, 'Forbidden resource', null), 'Не удалось ответить.')).toBe(
      'Не удалось ответить.',
    );
  });

  it('сеть, сессия, частота и сервер — своими словами', () => {
    expect(describeUnionError(new ApiError(0, '', null), 'x')).toBe('Нет соединения с сервером.');
    expect(describeUnionError(new ApiError(401, 'Unauthorized', null), 'x')).toBe('Сессия закончилась. Войдите снова.');
    expect(describeUnionError(new ApiError(429, 'ThrottlerException', null), 'x')).toMatch(/Слишком часто/);
    expect(describeUnionError(new ApiError(502, 'Bad Gateway', null), 'x')).toMatch(/Сервер временно/);
    expect(describeUnionError(new TypeError('Network request failed'), 'x')).toBe('Нет соединения с сервером.');
  });

  it('404 узнаётся отдельно — это «нет анкеты», а не поломка', () => {
    expect(isNotFound(new ApiError(404, 'Not Found', null))).toBe(true);
    expect(isNotFound(new ApiError(400, 'x', null))).toBe(false);
    expect(isNotFound(new Error('x'))).toBe(false);
  });
});
