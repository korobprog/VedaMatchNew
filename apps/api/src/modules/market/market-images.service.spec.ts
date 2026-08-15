import type { ConfigService } from '@nestjs/config';
import {
  MAX_IMAGES_PER_LISTING,
  MAX_UPLOAD_BYTES,
  MarketImagesService,
} from './market-images.service';

const S3_ENV = {
  S3_REGION: 'ru-1',
  S3_ACCESS_KEY: 'key',
  S3_SECRET_KEY: 'secret',
  S3_BUCKET_NAME: 'vedamatch',
  S3_PUBLIC_URL: 'https://cdn.vedamatch.ru/',
};

function configMock(env: Record<string, string> = S3_ENV) {
  return { get: (name: string) => env[name] } as unknown as ConfigService;
}

/** Однопиксельный png — sharp должен принять его как настоящее изображение. */
const PNG_PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

const file = (over: Partial<{ mimetype: string; size: number }> = {}) => ({
  buffer: PNG_PIXEL,
  mimetype: 'image/png',
  size: PNG_PIXEL.length,
  ...over,
});

describe('configuration', () => {
  // Локально S3 обычно не настроен — это штатный режим, а не поломка.
  it('stays inactive when S3 env is missing', () => {
    expect(new MarketImagesService(configMock({})).configured).toBe(false);
  });

  it('stays inactive when only part of the S3 env is present', () => {
    const partial = { ...S3_ENV };
    delete (partial as Partial<typeof S3_ENV>).S3_PUBLIC_URL;
    expect(new MarketImagesService(configMock(partial)).configured).toBe(false);

    const noBucket = { ...S3_ENV };
    delete (noBucket as Partial<typeof S3_ENV>).S3_BUCKET_NAME;
    expect(new MarketImagesService(configMock(noBucket)).configured).toBe(false);
  });

  it('becomes active with the full S3 env', () => {
    expect(new MarketImagesService(configMock()).configured).toBe(true);
  });

  it('never touches S3 while unconfigured', async () => {
    const service = new MarketImagesService(configMock({}));
    await expect(service.storeShopImage('shop-1', 'logo', file())).resolves.toBeNull();
    await expect(
      service.storeListingImage('listing-1', file()),
    ).resolves.toBeNull();
    // remove на ненастроенном сервисе должен молча выйти, а не бросить.
    await expect(service.remove('some/key.webp')).resolves.toBeUndefined();
  });
});

describe('validate', () => {
  const service = new MarketImagesService(configMock());

  it('demands a file', () => {
    expect(service.validate(undefined)).toBe('image_required');
  });

  it('accepts jpeg, png and webp', () => {
    for (const mimetype of ['image/jpeg', 'image/png', 'image/webp']) {
      expect(service.validate(file({ mimetype }))).toBeNull();
    }
  });

  it('rejects anything else, including formats that look harmless', () => {
    for (const mimetype of ['image/gif', 'image/svg+xml', 'application/pdf', 'text/html']) {
      expect(service.validate(file({ mimetype }))).toBe('unsupported_image_type');
    }
  });

  it('rejects oversized files at the boundary', () => {
    expect(service.validate(file({ size: MAX_UPLOAD_BYTES }))).toBeNull();
    expect(service.validate(file({ size: MAX_UPLOAD_BYTES + 1 }))).toBe(
      'image_file_too_large',
    );
  });

  // Тип проверяем раньше размера: «не тот формат» понятнее, чем «слишком
  // большой файл», когда человек перетащил PDF.
  it('reports the type before the size', () => {
    expect(
      service.validate(file({ mimetype: 'application/pdf', size: MAX_UPLOAD_BYTES + 1 })),
    ).toBe('unsupported_image_type');
  });
});

describe('storing', () => {
  function serviceWithSpy() {
    const service = new MarketImagesService(configMock());
    const send = jest.fn().mockResolvedValue({});
    (service as unknown as { s3Client: { send: jest.Mock } }).s3Client = { send };
    return { service, send };
  }

  it('puts a shop logo under a stable key so re-uploads overwrite it', async () => {
    const { service, send } = serviceWithSpy();
    const first = await service.storeShopImage('shop-1', 'logo', file());
    const second = await service.storeShopImage('shop-1', 'logo', file());

    expect(first?.key).toBe('market/shops/shop-1/logo.webp');
    expect(second?.key).toBe(first?.key);
    expect(first?.url).toBe(
      'https://cdn.vedamatch.ru/market/shops/shop-1/logo.webp',
    );
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('separates logo from cover', async () => {
    const { service } = serviceWithSpy();
    const logo = await service.storeShopImage('shop-1', 'logo', file());
    const cover = await service.storeShopImage('shop-1', 'cover', file());
    expect(logo?.key).not.toBe(cover?.key);
    expect(cover?.key).toBe('market/shops/shop-1/cover.webp');
  });

  // Ключ фото объявления случайный: иначе переупорядочивание переписывало бы
  // объекты в S3, а иммутабельный кеш отдавал бы старую картинку.
  it('gives every listing image its own key', async () => {
    const { service } = serviceWithSpy();
    const a = await service.storeListingImage('listing-1', file());
    const b = await service.storeListingImage('listing-1', file());
    expect(a?.key).not.toBe(b?.key);
    expect(a?.key).toMatch(/^market\/listings\/listing-1\/[0-9a-f-]{36}\.webp$/);
  });

  it('uploads public, immutable webp objects', async () => {
    const { service, send } = serviceWithSpy();
    await service.storeListingImage('listing-1', file());
    const input = send.mock.calls[0][0].input as Record<string, unknown>;
    expect(input.ContentType).toBe('image/webp');
    expect(input.ACL).toBe('public-read');
    expect(input.CacheControl).toBe('public, max-age=31536000, immutable');
    expect(input.Bucket).toBe('vedamatch');
  });

  it('reports the processed dimensions, not the original ones', async () => {
    const { service } = serviceWithSpy();
    const stored = await service.storeListingImage('listing-1', file());
    expect(stored?.width).toBe(1);
    expect(stored?.height).toBe(1);
    expect(stored?.sizeBytes).toBeGreaterThan(0);
  });

  it('trims a trailing slash from the public url exactly once', async () => {
    const { service } = serviceWithSpy();
    const stored = await service.storeShopImage('shop-1', 'logo', file());
    expect(stored?.url).not.toContain('//market');
  });

  it('rejects bytes that are not an image', async () => {
    const { service } = serviceWithSpy();
    await expect(
      service.storeListingImage('listing-1', {
        buffer: Buffer.from('definitely not an image'),
        mimetype: 'image/png',
        size: 23,
      }),
    ).rejects.toThrow();
  });
});

describe('removal', () => {
  it('swallows S3 failures instead of failing the request', async () => {
    const service = new MarketImagesService(configMock());
    const send = jest.fn().mockRejectedValue(new Error('bucket on fire'));
    (service as unknown as { s3Client: { send: jest.Mock } }).s3Client = { send };

    await expect(service.remove('market/listings/a/b.webp')).resolves.toBeUndefined();
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('ignores empty keys', async () => {
    const service = new MarketImagesService(configMock());
    const send = jest.fn();
    (service as unknown as { s3Client: { send: jest.Mock } }).s3Client = { send };

    await service.remove(null);
    await service.remove(undefined);
    await service.remove('');
    expect(send).not.toHaveBeenCalled();
  });

  it('removes a batch without stopping at the first failure', async () => {
    const service = new MarketImagesService(configMock());
    const send = jest
      .fn()
      .mockRejectedValueOnce(new Error('nope'))
      .mockResolvedValue({});
    (service as unknown as { s3Client: { send: jest.Mock } }).s3Client = { send };

    await service.removeMany(['a.webp', null, 'b.webp']);
    expect(send).toHaveBeenCalledTimes(2);
  });
});

describe('limits', () => {
  it('caps a listing gallery at eight images', () => {
    expect(MAX_IMAGES_PER_LISTING).toBe(8);
  });
});
