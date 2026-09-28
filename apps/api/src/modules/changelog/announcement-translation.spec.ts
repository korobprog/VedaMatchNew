import {
  BadGatewayException,
  BadRequestException,
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import {
  ANNOUNCEMENT_TRANSLATION_MAX_BODY,
  AnnouncementTranslationError,
  buildAnnouncementTranslationRequest,
  normalizeTranslationInput,
  parseAnnouncementTranslation,
  resolveTranslationProviderConfig,
} from './announcement-translation';
import { AnnouncementTranslationService } from './announcement-translation.service';

const completion = (content: string) => ({
  choices: [{ message: { content } }],
});

describe('resolveTranslationProviderConfig', () => {
  it('без своих переменных берёт ключ и модель Вдохновения', () => {
    expect(
      resolveTranslationProviderConfig({
        MOTIVATION_AI_BASE_URL: 'https://relay.fast/v1/',
        MOTIVATION_AI_API_KEY: 'k',
        MOTIVATION_TEXT_MODEL: 'gpt-5.4-mini',
      }),
    ).toEqual({
      baseUrl: 'https://relay.fast/v1',
      apiKey: 'k',
      model: 'gpt-5.4-mini',
    });
  });

  it('свои переменные важнее общих', () => {
    expect(
      resolveTranslationProviderConfig({
        CHANGELOG_AI_BASE_URL: 'https://a',
        CHANGELOG_AI_API_KEY: 'own',
        CHANGELOG_TEXT_MODEL: 'm1',
        MOTIVATION_AI_BASE_URL: 'https://b',
        MOTIVATION_AI_API_KEY: 'shared',
        MOTIVATION_TEXT_MODEL: 'm2',
      }),
    ).toEqual({ baseUrl: 'https://a', apiKey: 'own', model: 'm1' });
  });

  it('без ключа — не настроено', () => {
    expect(
      resolveTranslationProviderConfig({ MOTIVATION_AI_BASE_URL: 'https://b' }),
    ).toBeNull();
  });
});

describe('normalizeTranslationInput', () => {
  it('обрезает пробелы', () => {
    expect(
      normalizeTranslationInput({ titleRu: ' Привет ', bodyRu: '\nТекст\n' }),
    ).toEqual({ titleRu: 'Привет', bodyRu: 'Текст' });
  });

  it('пустая русская версия — ошибка', () => {
    expect(() => normalizeTranslationInput({ titleRu: ' ' })).toThrow(
      AnnouncementTranslationError,
    );
    expect(() => normalizeTranslationInput(null)).toThrow(
      AnnouncementTranslationError,
    );
  });

  it('слишком длинный текст — ошибка', () => {
    expect(() =>
      normalizeTranslationInput({
        titleRu: 'T',
        bodyRu: 'а'.repeat(ANNOUNCEMENT_TRANSLATION_MAX_BODY + 1),
      }),
    ).toThrow(/длиннее/);
  });
});

describe('buildAnnouncementTranslationRequest', () => {
  it('передаёт модель, просит JSON и кладёт русский текст в сообщение', () => {
    const request = buildAnnouncementTranslationRequest(
      { titleRu: 'Новость', bodyRu: 'Строка 1\nСтрока 2' },
      'gpt-5.4-mini',
    );
    expect(request.model).toBe('gpt-5.4-mini');
    expect(request.response_format).toEqual({ type: 'json_object' });
    expect(request.messages[0].role).toBe('system');
    expect(request.messages[0].content).toMatch(/Russian into English/);
    expect(request.messages[0].content).toMatch(/titleEn/);
    expect(JSON.parse(request.messages[1].content)).toEqual({
      titleRu: 'Новость',
      bodyRu: 'Строка 1\nСтрока 2',
    });
  });
});

describe('parseAnnouncementTranslation', () => {
  const input = { titleRu: 'Новость', bodyRu: 'Текст' };

  it('разбирает JSON-ответ', () => {
    expect(
      parseAnnouncementTranslation(
        completion('{"titleEn":" News ","bodyEn":"Text"}'),
        input,
      ),
    ).toEqual({ titleEn: 'News', bodyEn: 'Text' });
  });

  it('распаковывает JSON из блока кода', () => {
    expect(
      parseAnnouncementTranslation(
        completion('```json\n{"titleEn":"News","bodyEn":"Text"}\n```'),
        input,
      ),
    ).toEqual({ titleEn: 'News', bodyEn: 'Text' });
  });

  it('пустое поле допустимо, если пуст и оригинал', () => {
    expect(
      parseAnnouncementTranslation(completion('{"titleEn":"News"}'), {
        titleRu: 'Новость',
        bodyRu: '',
      }),
    ).toEqual({ titleEn: 'News', bodyEn: '' });
  });

  it.each([
    ['пустой ответ', {}],
    ['не JSON', completion('News: Text')],
    ['неполный перевод', completion('{"titleEn":"News","bodyEn":""}')],
  ])('%s — ошибка', (_name, payload) => {
    expect(() => parseAnnouncementTranslation(payload, input)).toThrow(
      AnnouncementTranslationError,
    );
  });
});

describe('AnnouncementTranslationService', () => {
  const env: Record<string, string> = {
    MOTIVATION_AI_BASE_URL: 'https://relay.test/v1',
    MOTIVATION_AI_API_KEY: 'secret',
    MOTIVATION_TEXT_MODEL: 'gpt-5.4-mini',
  };
  const makeService = (values: Record<string, string> = env) =>
    new AnnouncementTranslationService({
      get: (key: string) => values[key],
    } as unknown as ConfigService);
  const body = { titleRu: 'Новость', bodyRu: 'Текст' };
  let fetchMock: jest.SpyInstance;

  beforeEach(() => {
    fetchMock = jest.spyOn(global, 'fetch');
  });
  afterEach(() => fetchMock.mockRestore());

  it('ходит к провайдеру и возвращает перевод', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify(completion('{"titleEn":"News","bodyEn":"Text"}')),
      ),
    );

    await expect(makeService().translate('admin', body)).resolves.toEqual({
      titleEn: 'News',
      bodyEn: 'Text',
    });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://relay.test/v1/chat/completions');
    expect((init.headers as Record<string, string>).authorization).toBe(
      'Bearer secret',
    );
    expect(init.signal).toBeInstanceOf(AbortSignal);
    const sent = JSON.parse(init.body as string) as { model: string };
    expect(sent.model).toBe('gpt-5.4-mini');
  });

  it('не админу — 403, до провайдера не доходит', async () => {
    await expect(makeService().translate('user', body)).rejects.toThrow(
      ForbiddenException,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('пустой вход — 400', async () => {
    await expect(
      makeService().translate('admin', { titleRu: '', bodyRu: '' }),
    ).rejects.toThrow(BadRequestException);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('без ключа — 503 с понятным текстом', async () => {
    await expect(makeService({}).translate('admin', body)).rejects.toThrow(
      /не настроен/,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('таймаут — 503 «не ответил»', async () => {
    const timeout = new Error('timed out');
    timeout.name = 'TimeoutError';
    fetchMock.mockRejectedValue(timeout);

    const attempt = makeService().translate('admin', body);
    await expect(attempt).rejects.toThrow(ServiceUnavailableException);
    await expect(attempt).rejects.toThrow(/не ответил/);
  });

  it('ошибка провайдера — 502', async () => {
    fetchMock.mockResolvedValue(new Response('overloaded', { status: 529 }));

    await expect(makeService().translate('admin', body)).rejects.toThrow(
      BadGatewayException,
    );
  });

  it('мусор в ответе — 502', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify(completion('sorry'))),
    );

    await expect(makeService().translate('admin', body)).rejects.toThrow(
      BadGatewayException,
    );
  });
});
