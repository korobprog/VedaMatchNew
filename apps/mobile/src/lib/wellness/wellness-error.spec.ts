import { ApiError } from '@/lib/api/client';
import { describeScanError } from './wellness-error';

function api(status: number, message = '') {
  return new ApiError(status, message, null);
}

describe('describeScanError', () => {
  it('404 — товара нет в базе, и это не поломка', () => {
    const failure = describeScanError(api(404, 'Продукта пока нет в базе'));
    expect(failure.kind).toBe('not-found');
    expect(failure.retryable).toBe(false);
    expect(failure.message).toContain('нет в базе');
  });

  it('сеть недоступна — говорим про связь, а не про продукт', () => {
    // Обрыв связи `fetch` бросает обычной ошибкой, без статуса.
    const failure = describeScanError(new TypeError('Network request failed'));
    expect(failure.kind).toBe('offline');
    expect(failure.retryable).toBe(true);
    expect(failure.message).not.toContain('Network');
  });

  it('любая нестандартная ошибка тоже не показывает английский текст', () => {
    expect(describeScanError('что-то').message).not.toMatch(/[a-z]{4}/i);
    expect(describeScanError(undefined).kind).toBe('offline');
  });

  it('400 — дело в коде, повторять тем же кодом бессмысленно', () => {
    const failure = describeScanError(api(400, 'Штрихкод не распознан'));
    expect(failure.kind).toBe('bad-barcode');
    expect(failure.retryable).toBe(false);
  });

  it('401 ведёт ко входу, а не к «Повторить»', () => {
    const failure = describeScanError(api(401));
    expect(failure.kind).toBe('session');
    expect(failure.retryable).toBe(false);
  });

  it('429 — лимит проверок, названный по-человечески', () => {
    const failure = describeScanError(api(429));
    expect(failure.message).toContain('подряд');
    expect(failure.retryable).toBe(true);
  });

  it('500 — временно, повторить можно', () => {
    const failure = describeScanError(api(503));
    expect(failure.kind).toBe('server');
    expect(failure.retryable).toBe(true);
  });

  it('422 — снимок не про состав: переснять, а не повторить тот же', () => {
    const failure = describeScanError(
      api(422, 'Не вижу на снимке слова «Состав» — сфотографируйте ту часть упаковки, где написан состав.'),
    );
    expect(failure.kind).toBe('bad-photo');
    expect(failure.retryable).toBe(false);
    expect(failure.message).toContain('Состав');
  });

  it('422 без текста сервера всё равно объясняет, что переснять', () => {
    expect(describeScanError(api(422)).message).toContain('Состав');
  });

  it('кнопка «Повторить» показывается только там, где повтор помогает', () => {
    const retryable = [503, 429].map((status) => describeScanError(api(status)).retryable);
    const pointless = [404, 400, 401].map((status) => describeScanError(api(status)).retryable);
    expect(retryable).toEqual([true, true]);
    expect(pointless).toEqual([false, false, false]);
  });

  it('текст сервера доносится, когда он осмысленный', () => {
    expect(describeScanError(api(400, 'Штрихкод не распознан')).message).toBe(
      'Штрихкод не распознан',
    );
  });
});
