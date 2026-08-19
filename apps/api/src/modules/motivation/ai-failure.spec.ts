import {
  aiFailureReason,
  classifyAiFailure,
  isRetryableFailure,
} from './ai-failure';

describe('classifyAiFailure', () => {
  it('узнаёт упавший апстрим провайдера', () => {
    // Ровно та ошибка, что пришла с прода 19.08.2026.
    expect(
      classifyAiFailure(
        new Error(
          'Text provider error 503: {"error":{"code":"upstream_unavailable","message":"Внешний провайдер временно недоступен"}}',
        ),
      ),
    ).toBe('provider_unavailable');
  });

  it('отличает ограничение частоты и таймаут', () => {
    expect(classifyAiFailure(new Error('Text provider error 429'))).toBe(
      'rate_limited',
    );
    expect(classifyAiFailure(new Error('Request timed out'))).toBe('timeout');
  });

  it('узнаёт неразборчивый ответ модели', () => {
    expect(classifyAiFailure(new Error('Unexpected token in JSON'))).toBe(
      'bad_response',
    );
  });

  it('узнаёт пустой ответ провайдера', () => {
    // Тоже видели вживую: 200 и пустое тело вместо вердикта.
    expect(classifyAiFailure(new Error('Text provider returned no content'))).toBe(
      'bad_response',
    );
  });

  it('незнакомое считает неизвестным', () => {
    expect(classifyAiFailure(new Error('что-то пошло не так'))).toBe('unknown');
    expect(classifyAiFailure(null)).toBe('unknown');
  });
});

describe('isRetryableFailure', () => {
  it('повтор имеет смысл у всего, кроме неизвестного сбоя', () => {
    expect(isRetryableFailure('provider_unavailable')).toBe(true);
    expect(isRetryableFailure('rate_limited')).toBe(true);
    expect(isRetryableFailure('timeout')).toBe(true);
    expect(isRetryableFailure('bad_response')).toBe(true);
    expect(isRetryableFailure('unknown')).toBe(false);
  });
});

describe('aiFailureReason', () => {
  it('говорит администратору, что делать', () => {
    expect(aiFailureReason(new Error('503 upstream_unavailable'))).toContain(
      'повторить проверку',
    );
  });

  it('не тащит в интерфейс ответ провайдера с request id', () => {
    const reason = aiFailureReason(
      new Error('Text provider error 503: (request id: 2026081923288d9d6kdK4HYRx)'),
    );
    expect(reason).not.toContain('request id');
  });
});
