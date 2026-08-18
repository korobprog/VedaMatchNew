import { ConfigService } from '@nestjs/config';
import { BadGatewayException } from '@nestjs/common';
import { buildVideoRequest, FalVideoService } from './fal-video.service';

function service(overrides: Record<string, string> = {}) {
  const values: Record<string, string> = {
    FAL_KEY: 'test-key',
    MOTIVATION_VIDEO_MODEL: 'vendor/model',
    ...overrides,
  };
  const config = {
    get: (key: string) => values[key],
  } as unknown as ConfigService;
  return new FalVideoService(config);
}

describe('FalVideoService', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  function mockFetch(handler: (url: string) => unknown) {
    global.fetch = jest.fn(async (input: RequestInfo | URL) =>
      handler(String(input)),
    ) as unknown as typeof fetch;
  }

  const ok = (body: unknown) =>
    ({ ok: true, status: 200, json: async () => body }) as Response;

  it('без ключа считает себя выключенным и не лезет в сеть', () => {
    expect(service({ FAL_KEY: '' }).enabled).toBe(false);
    expect(service().enabled).toBe(true);
  });

  it('звук выключен по умолчанию и включается только явным true', () => {
    expect(service().audioEnabled()).toBe(false);
    expect(service({ MOTIVATION_VIDEO_AUDIO: 'false' }).audioEnabled()).toBe(
      false,
    );
    expect(service({ MOTIVATION_VIDEO_AUDIO: 'true' }).audioEnabled()).toBe(
      true,
    );
  });

  it('ставит задачу и отдаёт идентификатор со ссылками провайдера', async () => {
    let sent: RequestInit | undefined;
    global.fetch = jest.fn(async (_url: unknown, init?: RequestInit) => {
      sent = init;
      return ok({
        request_id: 'req-1',
        status_url: 'https://queue/status',
        response_url: 'https://queue/result',
      });
    }) as unknown as typeof fetch;

    const result = await service().submit({
      imageUrl: 'https://cdn/pic.png',
      prompt: 'тихий рассвет',
    });

    expect(result).toEqual({
      requestId: 'req-1',
      statusUrl: 'https://queue/status',
      responseUrl: 'https://queue/result',
    });
    const body = JSON.parse(String(sent?.body)) as Record<string, unknown>;
    expect(body.image_url).toBe('https://cdn/pic.png');
    expect(body.generate_audio).toBe(false);
    // Поля, зависящие от модели, проверяются отдельно в buildVideoRequest:
    // здесь модель выдуманная, и соотношение сторон ей не передаётся.
    expect(body.resolution).toBe('720p');
  });

  // Раньше сервис достраивал ссылки из имени модели. На живом ответе база
  // оказалась другой (`fal-ai/bytedance`, а не полный путь модели), поэтому
  // отсутствие ссылок — это ошибка, а не повод их выдумывать.
  it('без ссылок от провайдера падает, а не выдумывает их', async () => {
    mockFetch(() => ok({ request_id: 'req-2' }));

    await expect(
      service().submit({ imageUrl: 'https://cdn/pic.png', prompt: 'кадр' }),
    ).rejects.toBeInstanceOf(BadGatewayException);
  });

  it('кладёт кадр в хранилище провайдера и возвращает ссылку', async () => {
    const calls: string[] = [];
    global.fetch = jest.fn(async (url: unknown, init?: RequestInit) => {
      calls.push(`${init?.method ?? 'GET'} ${String(url)}`);
      if (String(url).includes('initiate'))
        return ok({ file_url: 'https://cdn/f.jpg', upload_url: 'https://up' });
      return { ok: true, status: 200 } as Response;
    }) as unknown as typeof fetch;

    await expect(service().upload(Buffer.from('x'))).resolves.toBe(
      'https://cdn/f.jpg',
    );
    expect(calls[0]).toContain('POST');
    expect(calls[1]).toBe('PUT https://up');
  });

  it('ошибку валидации из COMPLETED показывает причиной, а не «нет видео»', async () => {
    mockFetch((url) =>
      url === 's'
        ? ok({ status: 'COMPLETED' })
        : ok({ detail: [{ type: 'file_download_error', msg: 'no access' }] }),
    );

    await expect(
      service().poll({ statusUrl: 's', responseUrl: 'r' }),
    ).resolves.toEqual({ state: 'failed', reason: 'file_download_error' });
  });

  it('ошибку провайдера при постановке превращает в BadGateway', async () => {
    global.fetch = jest.fn(async () => ({
      ok: false,
      status: 402,
      text: async () => 'insufficient balance',
    })) as unknown as typeof fetch;

    await expect(
      service().submit({ imageUrl: 'https://cdn/pic.png', prompt: 'кадр' }),
    ).rejects.toBeInstanceOf(BadGatewayException);
  });

  it('очередь и обработку считает ожиданием, а не ошибкой', async () => {
    for (const status of ['IN_QUEUE', 'IN_PROGRESS']) {
      mockFetch(() => ok({ status }));
      await expect(
        service().poll({ statusUrl: 's', responseUrl: 'r' }),
      ).resolves.toEqual({ state: 'running' });
    }
  });

  it('на COMPLETED дочитывает результат и отдаёт ссылку на ролик', async () => {
    mockFetch((url) =>
      url === 's'
        ? ok({ status: 'COMPLETED' })
        : ok({ video: { url: 'https://cdn/clip.mp4' } }),
    );

    await expect(
      service().poll({ statusUrl: 's', responseUrl: 'r' }),
    ).resolves.toEqual({ state: 'ready', videoUrl: 'https://cdn/clip.mp4' });
  });

  it('COMPLETED без ролика в ответе — это провал, а не готовность', async () => {
    mockFetch((url) => (url === 's' ? ok({ status: 'COMPLETED' }) : ok({})));

    await expect(
      service().poll({ statusUrl: 's', responseUrl: 'r' }),
    ).resolves.toEqual({ state: 'failed', reason: 'no_video_in_response' });
  });

  it('FAILED от провайдера не считает ожиданием', async () => {
    mockFetch(() => ok({ status: 'FAILED' }));

    await expect(
      service().poll({ statusUrl: 's', responseUrl: 'r' }),
    ).resolves.toEqual({ state: 'failed', reason: 'provider_failed' });
  });
});

describe('FalVideoService: защита от платных ошибок', () => {
  it('пустую картинку или промпт не отправляет в сеть вообще', async () => {
    const fetchSpy = jest.fn();
    global.fetch = fetchSpy as unknown as typeof fetch;
    const config = {
      get: (k: string) => ({ FAL_KEY: 'k' })[k],
    } as unknown as import('@nestjs/config').ConfigService;
    const svc = new FalVideoService(config);

    await expect(svc.submit({ imageUrl: '', prompt: 'x' })).rejects.toThrow();
    await expect(svc.submit({ imageUrl: 'u', prompt: '  ' })).rejects.toThrow();
    // Ключевое: до провайдера дело не дошло — кривое тело он бы принял и
    // выставил счёт.
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('buildVideoRequest', () => {
  const base = {
    imageUrl: 'https://cdn/frame.jpg',
    prompt: 'мягкое движение',
    seconds: 5,
    audio: false,
  };

  it('Seedance получает соотношение сторон явно', () => {
    const request = buildVideoRequest({
      ...base,
      model: 'fal-ai/bytedance/seedance/v1/pro/fast/image-to-video',
    });
    expect(request.aspect_ratio).toBe('9:16');
    expect(request.generate_audio).toBe(false);
  });

  it('Wan соотношения не получает — он такого поля не знает', () => {
    // Лишнее поле ушло бы в платный запрос: на неразобранном теле однажды
    // сгорело $2.50.
    const request = buildVideoRequest({
      ...base,
      model: 'wan/v2.6/image-to-video/flash',
    });
    expect(request.aspect_ratio).toBeUndefined();
    expect(request.generate_audio).toBe(false);
  });

  it('у Vidu звук называется иначе', () => {
    const request = buildVideoRequest({
      ...base,
      model: 'fal-ai/vidu/q3/image-to-video',
    });
    expect(request.audio).toBe(false);
    expect(request.generate_audio).toBeUndefined();
  });

  it('общие поля есть у всех', () => {
    for (const model of [
      'fal-ai/bytedance/seedance/v1/pro/fast/image-to-video',
      'wan/v2.6/image-to-video/flash',
      'fal-ai/vidu/q3/image-to-video',
    ]) {
      const request = buildVideoRequest({ ...base, model });
      expect(request.image_url).toBe('https://cdn/frame.jpg');
      expect(request.duration).toBe(5);
      expect(request.resolution).toBe('720p');
    }
  });
});
