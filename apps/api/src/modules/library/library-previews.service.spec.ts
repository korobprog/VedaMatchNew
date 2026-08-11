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

function prismaMock() {
  return {
    libraryEntry: { update: jest.fn().mockResolvedValue({}) },
  };
}

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
    expect(put.input.Key).toBe('library/previews/entry-1.webp');
    expect(put.input.ContentType).toBe('image/webp');
    expect(Buffer.isBuffer(put.input.Body)).toBe(true);

    expect(prisma.libraryEntry.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'entry-1' },
        data: expect.objectContaining({
          previewKey: 'library/previews/entry-1.webp',
          previewUrl: 'https://cdn.vedamatch.ru/library/previews/entry-1.webp',
          enrichmentStatus: 'ready',
        }) as object,
      }),
    );
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
