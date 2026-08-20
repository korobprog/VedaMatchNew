import { ConfigService } from '@nestjs/config';
import { MotivationGenerationService } from './motivation-generation.service';

// Резерв по умолчанию выключен: эти тесты про основной путь, а включённый
// запасной поставщик проглатывал бы ошибки релея, которые они и проверяют.
const falImage = { enabled: false, generate: jest.fn() } as never;

describe('MotivationGenerationService', () => {
  afterEach(() => jest.restoreAllMocks());

  it('does not call the image API without approved text and a stored image prompt', async () => {
    const config = {
      get: (key: string) =>
        ({
          MOTIVATION_AI_API_KEY: 'test',
          MOTIVATION_AI_BASE_URL: 'https://example.test/v1',
        })[key],
    } as ConfigService;
    const service = new MotivationGenerationService(config, falImage);
    const fetchMock = jest.spyOn(global, 'fetch');

    await expect(
      service.generateApprovedImage({
        imagePrompt: 'unapproved',
        textApprovedAt: null,
      }),
    ).rejects.toThrow('approved');

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('переходит на запасную модель, когда канал основной лёг', async () => {
    // Релей раздаёт модель через каналы, и канал ложится при исправном ключе:
    // «upstream_unavailable, текущий источник GPT Team/Plus». Без запасной
    // модели это давало «сбой модели» и ручной разбор нормального текста.
    const config = {
      get: (key: string) =>
        ({
          MOTIVATION_AI_API_KEY: 'test',
          MOTIVATION_AI_BASE_URL: 'https://example.test/v1',
          MOTIVATION_TEXT_MODEL: 'gpt-5.4-mini',
          MOTIVATION_TEXT_MODEL_FALLBACK: 'gemini-3.6-flash',
        })[key],
    } as ConfigService;
    const service = new MotivationGenerationService(config, falImage);
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        new Response('{"error":{"code":"upstream_unavailable"}}', {
          status: 503,
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [{ message: { content: '{"decision":"approve"}' } }],
          }),
          { status: 200 },
        ),
      );

    await expect(service.moderationVerdict('проверь')).resolves.toEqual({
      decision: 'approve',
    });

    const models = fetchMock.mock.calls.map(
      ([, init]) => JSON.parse(String((init as RequestInit).body)).model,
    );
    expect(models).toEqual(['gpt-5.4-mini', 'gemini-3.6-flash']);
  });

  it('не ходит дважды, когда запасная модель совпадает с основной', async () => {
    const config = {
      get: (key: string) =>
        ({
          MOTIVATION_AI_API_KEY: 'test',
          MOTIVATION_AI_BASE_URL: 'https://example.test/v1',
          MOTIVATION_TEXT_MODEL: 'gemini-3.6-flash',
          MOTIVATION_TEXT_MODEL_FALLBACK: 'gemini-3.6-flash',
        })[key],
    } as ConfigService;
    const service = new MotivationGenerationService(config, falImage);
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response('нет', { status: 503 }));

    await expect(service.moderationVerdict('проверь')).rejects.toThrow('503');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('разбирает вердикт, обёрнутый в markdown-ограждение', async () => {
    const config = {
      get: (key: string) =>
        ({
          MOTIVATION_AI_API_KEY: 'test',
          MOTIVATION_AI_BASE_URL: 'https://example.test/v1',
        })[key],
    } as ConfigService;
    const service = new MotivationGenerationService(config, falImage);
    jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: ['```json', '{"decision":"reject"}', '```'].join(String.fromCharCode(10)),
              },
            },
          ],
        }),
        { status: 200 },
      ),
    );

    await expect(service.moderationVerdict('проверь')).resolves.toEqual({
      decision: 'reject',
    });
  });

  it('sends the provider-compatible chat and image request contract', async () => {
    const config = {
      get: (key: string) =>
        ({
          MOTIVATION_AI_API_KEY: 'test',
          MOTIVATION_AI_BASE_URL: 'https://example.test/v1',
          MOTIVATION_IMAGE_MODEL: 'gpt-image-2',
        })[key],
    } as ConfigService;
    const service = new MotivationGenerationService(config, falImage);
    const png = Buffer.concat([
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      Buffer.alloc(1200),
    ]).toString('base64');
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    ru: { title: 'ru', text: 'ru', storyText: 'ru' },
                    en: { title: 'en', text: 'en', storyText: 'en' },
                    hi: { title: 'hi', text: 'hi', storyText: 'hi' },
                  }),
                },
              },
            ],
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: [{ b64_json: png }] }), {
          status: 200,
        }),
      );

    await service.generateCopy({
      profileType: 'seeker',
      audienceTrack: 'universal',
      category: 'daily',
    });
    await expect(service.generateImage('test')).resolves.toEqual({
      bytes: Buffer.from(png, 'base64'),
      provider: 'relay',
    });

    const chatOptions = fetchMock.mock.calls[0][1] as RequestInit;
    expect(chatOptions.headers).toMatchObject({
      'user-agent': 'OpenAI-Python/1.0',
    });
    expect(JSON.parse(String(chatOptions.body))).toMatchObject({
      model: 'deepseek-v4-flash',
      stream: true,
    });
    const imageOptions = fetchMock.mock.calls[1][1] as RequestInit;
    expect(imageOptions.headers).toMatchObject({
      'user-agent': 'OpenAI-Python/1.0',
    });
    expect(JSON.parse(String(imageOptions.body))).toMatchObject({
      model: 'gpt-image-2',
      size: '1024x1536',
    });
  });

  it('parses streamed chat completion content', async () => {
    const config = {
      get: (key: string) =>
        ({
          MOTIVATION_AI_API_KEY: 'test',
          MOTIVATION_AI_BASE_URL: 'https://example.test/v1',
          MOTIVATION_TEXT_MODEL: 'gpt-5.5',
        })[key],
    } as ConfigService;
    const service = new MotivationGenerationService(config, falImage);
    const copy = JSON.stringify({
      ru: { title: 'ru', text: 'ru', storyText: 'ru' },
      en: { title: 'en', text: 'en', storyText: 'en' },
      hi: { title: 'hi', text: 'hi', storyText: 'hi' },
    });
    const midpoint = Math.floor(copy.length / 2);
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(
        new Response(
          `data: ${JSON.stringify({ choices: [{ delta: { content: copy.slice(0, midpoint) } }] })}\n\n` +
            `data: ${JSON.stringify({ choices: [{ delta: { content: copy.slice(midpoint) } }] })}\n\n` +
            'data: [DONE]\n\n',
          { status: 200, headers: { 'content-type': 'text/event-stream' } },
        ),
      );

    await expect(
      service.generateCopy({
        profileType: 'seeker',
        audienceTrack: 'universal',
        category: 'daily',
      }),
    ).resolves.toHaveLength(3);
  });

  it('requests strict sourced-quote copy without invoking image generation', async () => {
    const config = {
      get: (key: string) =>
        ({
          MOTIVATION_AI_API_KEY: 'test',
          MOTIVATION_AI_BASE_URL: 'https://example.test/v1',
          MOTIVATION_TEXT_MODEL: 'gpt-5.5',
        })[key],
    } as ConfigService;
    const service = new MotivationGenerationService(config, falImage);
    const payload = {
      originalText: 'Exact quote',
      profileTypes: ['user'],
      explanation: 'A sufficiently detailed explanation of the exact quote.',
      translations: {},
    };
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(
        new Response(
          `data: ${JSON.stringify({ choices: [{ delta: { content: JSON.stringify(payload) } }] })}\n\ndata: [DONE]\n\n`,
          { status: 200, headers: { 'content-type': 'text/event-stream' } },
        ),
      );

    await expect(
      service.generateVerifiedQuoteCopy({
        originalText: 'Exact quote',
        originalLanguage: 'en',
        author: 'Author',
        work: 'Work',
        locator: '1',
        contextExcerpt: 'Exact quote in context',
      }),
    ).resolves.toMatchObject({ originalText: 'Exact quote' });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(
      String((fetchMock.mock.calls[0][1] as RequestInit).body),
    );
    expect(body).toMatchObject({
      model: 'gpt-5.5',
      response_format: { type: 'json_object' },
      stream: true,
    });
    expect(body.messages[0].content).toContain('Never alter originalText');
    expect(body.messages[0].content).toContain(
      'user, in_goodness, yogi, devotee',
    );
    expect(body.messages[0].content).toContain(
      'Every language key is mandatory',
    );
    expect(body.messages[0].content).toContain('Перевод VedaMatch');
  });

  it('rejects decoded image data without a PNG signature', async () => {
    const config = {
      get: (key: string) =>
        ({
          MOTIVATION_AI_API_KEY: 'test',
          MOTIVATION_AI_BASE_URL: 'https://example.test/v1',
        })[key],
    } as ConfigService;
    const service = new MotivationGenerationService(config, falImage);
    jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [{ b64_json: Buffer.alloc(1200).toString('base64') }],
        }),
        { status: 200 },
      ),
    );
    await expect(service.generateImage('test')).rejects.toThrow('valid PNG');
  });

  it('aborts when the image request does not finish in time', async () => {
    const config = {
      get: (key: string) =>
        ({
          MOTIVATION_AI_API_KEY: 'test',
          MOTIVATION_AI_BASE_URL: 'https://example.test/v1',
          MOTIVATION_IMAGE_TIMEOUT_MS: '20',
        })[key],
    } as ConfigService;
    const service = new MotivationGenerationService(config, falImage);
    jest.spyOn(global, 'fetch').mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          const signal = (init as RequestInit).signal;
          signal?.addEventListener('abort', () =>
            reject(signal.reason as Error),
          );
        }),
    );

    await expect(service.generateImage('test')).rejects.toThrow('timed out');
  });
});

describe('MotivationGenerationService.generateImage — запасной поставщик', () => {
  const config = {
    get: (key: string) =>
      ({
        MOTIVATION_AI_API_KEY: 'test',
        MOTIVATION_AI_BASE_URL: 'https://example.test/v1',
      })[key],
  } as ConfigService;

  function build(falEnabled: boolean) {
    const generate = jest.fn().mockResolvedValue(Buffer.from('fal-png'));
    const service = new MotivationGenerationService(config, {
      enabled: falEnabled,
      generate,
    } as never);
    const relay = jest.spyOn(
      service as unknown as {
        requestRelayImage: (prompt: string) => Promise<Buffer>;
      },
      'requestRelayImage',
    );
    return { service, relay, generate };
  }

  it('отдаёт кадр релея и не трогает резерв, пока основной жив', async () => {
    const { service, relay, generate } = build(true);
    relay.mockResolvedValue(Buffer.from('relay-png'));

    await expect(service.generateImage('храм')).resolves.toEqual({
      bytes: Buffer.from('relay-png'),
      provider: 'relay',
    });
    expect(generate).not.toHaveBeenCalled();
  });

  it('переключается на резерв, когда канал релея лёг', async () => {
    // Ровно тот сбой, ради которого всё делалось: ключ исправен, а канал нет.
    const { service, relay, generate } = build(true);
    relay.mockRejectedValue(new Error('upstream_unavailable'));

    await expect(service.generateImage('храм')).resolves.toEqual({
      bytes: Buffer.from('fal-png'),
      provider: 'fal',
    });
    expect(generate).toHaveBeenCalledWith('храм');
  });

  it('без ключа резерва отдаёт исходную ошибку, а не свою', async () => {
    const { service, relay, generate } = build(false);
    relay.mockRejectedValue(new Error('upstream_unavailable'));

    await expect(service.generateImage('храм')).rejects.toThrow(
      'upstream_unavailable',
    );
    expect(generate).not.toHaveBeenCalled();
  });

  it('не прячет сбой резерва: если упали оба, наверх идёт ошибка резерва', async () => {
    const { service, relay, generate } = build(true);
    relay.mockRejectedValue(new Error('upstream_unavailable'));
    generate.mockRejectedValue(new Error('Fallback image provider failed'));

    await expect(service.generateImage('храм')).rejects.toThrow(
      'Fallback image provider failed',
    );
  });
});
