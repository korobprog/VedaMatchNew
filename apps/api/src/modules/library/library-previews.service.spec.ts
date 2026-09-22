import { LibraryPreviewsService } from './library-previews.service';

const S3_ENV = {
  S3_REGION: 'ru-1',
  S3_ACCESS_KEY: 'key',
  S3_SECRET_KEY: 'secret',
  S3_BUCKET_NAME: 'vedamatch',
  S3_PUBLIC_URL: 'https://cdn.vedamatch.ru/',
};

function configMock(env: Record<string, string> = S3_ENV) {
  return { get: (name: string) => env[name] };
}

function prismaMock(previousKey: string | null = null, custom = false) {
  return {
    libraryEntry: {
      findUnique: jest.fn().mockResolvedValue({
        previewKey: previousKey,
        previewIsCustom: custom,
      }),
      update: jest.fn().mockResolvedValue({}),
    },
  };
}

/** Ключ копии обложки: новый на каждую загрузку (VED-155). */
const FRESH_KEY = /^library\/previews\/entry-1-[0-9a-f]{8}\.webp$/;

/** Однопиксельный png — sharp должен принять его как настоящее изображение. */
const PNG_PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

function fetchReturning(body: Buffer) {
  return jest.fn().mockResolvedValue({
    ok: true,
    headers: new Map([['content-length', String(body.length)]]),
    arrayBuffer: () =>
      Promise.resolve(
        body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength),
      ),
  });
}

describe('LibraryPreviewsService', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('is inactive until S3 is configured', () => {
    const service = new LibraryPreviewsService(
      prismaMock() as never,
      configMock({}) as never,
    );

    expect(service.configured).toBe(false);
  });

  it('stores a compressed webp copy and points the entry at it', async () => {
    global.fetch = fetchReturning(PNG_PIXEL) as never;
    const prisma = prismaMock();
    const service = new LibraryPreviewsService(
      prisma as never,
      configMock() as never,
    );
    const send = jest.fn<
      Promise<unknown>,
      [{ input: Record<string, unknown> }]
    >(() => Promise.resolve({}));
    (service as unknown as { s3Client: { send: unknown } }).s3Client = { send };

    await service.capture(
      'entry-1',
      'https://youtu.be/OXDrvBwIHLg',
      'https://i.ytimg.com/vi/OXDrvBwIHLg/hqdefault.jpg',
    );

    const put = send.mock.calls[0][0];
    const key = put.input.Key as string;
    expect(key).toMatch(FRESH_KEY);
    expect(put.input.ContentType).toBe('image/webp');
    expect(Buffer.isBuffer(put.input.Body)).toBe(true);

    expect(prisma.libraryEntry.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'entry-1' },
        data: expect.objectContaining({
          previewKey: key,
          previewUrl: `https://cdn.vedamatch.ru/${key}`,
          enrichmentStatus: 'ready',
        }) as object,
      }),
    );
  });

  // VED-155: при одном ключе на запись новая обложка ложилась по старому
  // адресу, закэшированному на год, и выглядела неизменившейся.
  it('кладёт новую обложку по новому адресу и убирает прежнюю копию', async () => {
    global.fetch = fetchReturning(PNG_PIXEL) as never;
    const prisma = prismaMock('library/previews/entry-1.webp');
    const service = new LibraryPreviewsService(
      prisma as never,
      configMock() as never,
    );
    const send = jest.fn<
      Promise<unknown>,
      [{ input: Record<string, unknown> }]
    >(() => Promise.resolve({}));
    (service as unknown as { s3Client: { send: unknown } }).s3Client = { send };

    await service.capture(
      'entry-1',
      'https://youtu.be/OXDrvBwIHLg',
      'https://i.ytimg.com/vi/OXDrvBwIHLg/hqdefault.jpg',
    );

    const [put, remove] = send.mock.calls.map((call) => call[0].input);
    expect(put.Key).toMatch(FRESH_KEY);
    expect(put.Key).not.toBe('library/previews/entry-1.webp');
    expect(remove).toEqual({
      Bucket: 'vedamatch',
      Key: 'library/previews/entry-1.webp',
    });
  });

  // VED-344/VED-355: формы шлют приложенную картинку сразу за созданием
  // записи, то есть ровно тогда, когда фоновое обогащение ещё качает
  // картинку со страницы источника. Без этой проверки оно затирало бы
  // выбранную человеком через пару секунд после публикации.
  it('не затирает картинку, загруженную человеком', async () => {
    global.fetch = fetchReturning(PNG_PIXEL) as never;
    const prisma = prismaMock('library/previews/entry-1-abcdef12.webp', true);
    const service = new LibraryPreviewsService(
      prisma as never,
      configMock() as never,
    );
    const send = jest.fn<
      Promise<unknown>,
      [{ input: Record<string, unknown> }]
    >(() => Promise.resolve({}));
    (service as unknown as { s3Client: { send: unknown } }).s3Client = { send };

    await service.capture(
      'entry-1',
      'https://example.com/article',
      'https://example.com/og.jpg',
    );

    expect(prisma.libraryEntry.update).not.toHaveBeenCalled();
    // Скачанное уже легло в бакет — убираем его, а не ручную копию.
    const [put, remove] = send.mock.calls.map((call) => call[0].input);
    expect(put.Key).toMatch(FRESH_KEY);
    expect(remove).toEqual({ Bucket: 'vedamatch', Key: put.Key });
  });

  it('keeps the entry untouched when the download fails', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('timeout')) as never;
    const prisma = prismaMock();
    const service = new LibraryPreviewsService(
      prisma as never,
      configMock() as never,
    );

    await service.capture(
      'entry-1',
      'https://youtu.be/OXDrvBwIHLg',
      'https://i.ytimg.com/vi/x/hqdefault.jpg',
    );

    expect(prisma.libraryEntry.update).not.toHaveBeenCalled();
  });

  it('does nothing at all without S3', async () => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock as never;
    const prisma = prismaMock();
    const service = new LibraryPreviewsService(
      prisma as never,
      configMock({}) as never,
    );

    await service.capture('entry-1', 'https://youtu.be/OXDrvBwIHLg');

    expect(fetchMock).not.toHaveBeenCalled();
    expect(prisma.libraryEntry.update).not.toHaveBeenCalled();
  });
});
