import {
  parseCompletion,
  parseToolCallArguments,
  ProviderResponseError,
  resolveProviderConfig,
} from './assistant-provider';

describe('parseCompletion', () => {
  it('разбирает текстовый ответ и расход', () => {
    expect(
      parseCompletion({
        choices: [{ message: { content: 'Привет' } }],
        usage: { prompt_tokens: 120, completion_tokens: 8 },
      }),
    ).toEqual({
      content: 'Привет',
      toolCalls: [],
      usage: { tokensIn: 120, tokensOut: 8 },
    });
  });

  it('разбирает вызовы инструментов, аргументы оставляет строкой', () => {
    const parsed = parseCompletion({
      choices: [
        {
          message: {
            content: null,
            tool_calls: [
              {
                id: 'call_1',
                type: 'function',
                function: {
                  name: 'market_search',
                  arguments: '{"query":"сари"}',
                },
              },
              {
                type: 'function',
                function: {
                  name: 'music_search',
                  arguments: { query: 'киртан' },
                },
              },
              { type: 'function', function: {} },
            ],
          },
        },
      ],
    });
    expect(parsed.content).toBe('');
    expect(parsed.toolCalls).toEqual([
      { id: 'call_1', name: 'market_search', arguments: '{"query":"сари"}' },
      { id: 'call_1', name: 'music_search', arguments: '{"query":"киртан"}' },
    ]);
    expect(parsed.usage).toEqual({ tokensIn: 0, tokensOut: 0 });
  });

  it('пустой ответ — ошибка провайдера', () => {
    expect(() => parseCompletion({})).toThrow(ProviderResponseError);
    expect(() =>
      parseCompletion({ choices: [{ message: { content: '   ' } }] }),
    ).toThrow(ProviderResponseError);
  });

  it('невалидные аргументы вызова превращаются в пустой объект', () => {
    expect(parseToolCallArguments('{"a":1}')).toEqual({ a: 1 });
    expect(parseToolCallArguments('{oops')).toEqual({});
  });
});

describe('resolveProviderConfig', () => {
  it('свои переменные старше переменных Вдохновения', () => {
    expect(
      resolveProviderConfig({
        ASSISTANT_AI_BASE_URL: 'https://a/v1/',
        ASSISTANT_AI_API_KEY: 'k1',
        ASSISTANT_TEXT_MODEL: 'm1',
        MOTIVATION_AI_BASE_URL: 'https://b/v1',
        MOTIVATION_AI_API_KEY: 'k2',
        MOTIVATION_TEXT_MODEL: 'm2',
      }),
    ).toEqual({ baseUrl: 'https://a/v1', apiKey: 'k1', model: 'm1' });
  });

  it('без своих берёт ключ Вдохновения, без обоих — не настроен', () => {
    expect(
      resolveProviderConfig({
        MOTIVATION_AI_BASE_URL: 'https://b/v1',
        MOTIVATION_AI_API_KEY: 'k2',
      }),
    ).toEqual({ baseUrl: 'https://b/v1', apiKey: 'k2', model: 'gpt-5.4-mini' });
    expect(resolveProviderConfig({})).toBeNull();
    expect(
      resolveProviderConfig({ ASSISTANT_AI_BASE_URL: 'https://a' }),
    ).toBeNull();
  });
});
