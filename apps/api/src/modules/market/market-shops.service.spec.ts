import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import type { PrismaService } from '../../prisma/prisma.service';
import type { MarketImagesService } from './market-images.service';
import { MarketShopsService } from './market-shops.service';

const shopRow = (over: Record<string, unknown> = {}) => ({
  id: 'shop-1',
  ownerId: 'user-1',
  slug: 'lavka',
  name: 'Лавка',
  taglineRu: null,
  taglineEn: null,
  aboutRu: null,
  aboutEn: null,
  logoUrl: null,
  logoKey: null,
  coverUrl: null,
  coverKey: null,
  location: null,
  city: null,
  country: null,
  messengers: null,
  deliveryOptions: [],
  status: 'active',
  listingsCount: 0,
  ordersCount: 0,
  reviewsCount: 0,
  ratingAvg: 0,
  followersCount: 0,
  createdAt: new Date('2026-08-15T10:00:00.000Z'),
  ...over,
});

function prismaMock() {
  return {
    marketShop: {
      findUnique: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn().mockImplementation(({ data }) => shopRow(data)),
      update: jest.fn().mockImplementation(({ data }) => shopRow(data)),
    },
    user: {
      findUnique: jest.fn().mockResolvedValue({ homeLocation: null }),
    },
    userBlock: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
    },
  };
}

const imagesMock = () =>
  ({
    configured: true,
    validate: jest.fn().mockReturnValue(null),
    storeShopImage: jest
      .fn()
      .mockResolvedValue({ key: 'k', url: 'https://cdn/k', width: 1, height: 1, sizeBytes: 1 }),
  }) as unknown as MarketImagesService;

const service = (mocks: ReturnType<typeof prismaMock>, images = imagesMock()) =>
  new MarketShopsService(mocks as unknown as PrismaService, images);

describe('create', () => {
  it('refuses without acceptance of the Market rules', async () => {
    const mocks = prismaMock();
    await expect(
      service(mocks).create('user-1', { name: 'Лавка', rulesAccepted: false }),
    ).rejects.toThrow(BadRequestException);
    expect(mocks.marketShop.create).not.toHaveBeenCalled();
  });

  it('records when the rules were accepted', async () => {
    const mocks = prismaMock();
    await service(mocks).create('user-1', { name: 'Лавка', rulesAccepted: true });
    const data = mocks.marketShop.create.mock.calls[0][0].data;
    expect(data.rulesAcceptedAt).toBeInstanceOf(Date);
  });

  it('allows only one shop per user', async () => {
    const mocks = prismaMock();
    mocks.marketShop.findUnique.mockResolvedValue({ id: 'shop-1' });
    await expect(
      service(mocks).create('user-1', { name: 'Вторая', rulesAccepted: true }),
    ).rejects.toThrow(ConflictException);
  });

  it('demands a name', async () => {
    const mocks = prismaMock();
    await expect(
      service(mocks).create('user-1', { name: '   ', rulesAccepted: true }),
    ).rejects.toThrow(BadRequestException);
  });

  it('builds a transliterated slug from the name', async () => {
    const mocks = prismaMock();
    await service(mocks).create('user-1', {
      name: 'Мастерская Говинды',
      rulesAccepted: true,
    });
    expect(mocks.marketShop.create.mock.calls[0][0].data.slug).toBe(
      'masterskaya-govindy',
    );
  });

  // Слаг магазина не должен перехватывать маршруты Рынка вроде /market/cart.
  it('skips a reserved slug and takes the next suffix', async () => {
    const mocks = prismaMock();
    await service(mocks).create('user-1', { name: 'Cart', rulesAccepted: true });
    expect(mocks.marketShop.create.mock.calls[0][0].data.slug).toBe('cart-2');
  });

  it('walks past taken slugs', async () => {
    const mocks = prismaMock();
    // Первый вызов — проверка «магазин уже есть», дальше — занятость слагов.
    mocks.marketShop.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'other-1' })
      .mockResolvedValueOnce({ id: 'other-2' })
      .mockResolvedValue(null);

    await service(mocks).create('user-1', { name: 'Лавка', rulesAccepted: true });
    expect(mocks.marketShop.create.mock.calls[0][0].data.slug).toBe('lavka-3');
  });

  // Чтение User read-only разрешено контрактом; владелец потом переопределит.
  it('prefills the location from the portal profile', async () => {
    const mocks = prismaMock();
    mocks.user.findUnique.mockResolvedValue({
      homeLocation: { city: 'Москва', country: 'Россия', lat: 55.75, lon: 37.62 },
    });
    await service(mocks).create('user-1', { name: 'Лавка', rulesAccepted: true });

    const data = mocks.marketShop.create.mock.calls[0][0].data;
    expect(data.city).toBe('Москва');
    expect(data.latitude).toBe(55.75);
    expect(data.longitude).toBe(37.62);
  });

  it('ignores a profile location without a city', async () => {
    const mocks = prismaMock();
    mocks.user.findUnique.mockResolvedValue({ homeLocation: { lat: 0, lon: 0 } });
    await service(mocks).create('user-1', { name: 'Лавка', rulesAccepted: true });
    expect(mocks.marketShop.create.mock.calls[0][0].data.city).toBeNull();
  });
});

describe('ownership', () => {
  it('lets the owner through', async () => {
    const mocks = prismaMock();
    mocks.marketShop.findUnique.mockResolvedValue(shopRow());
    await expect(
      service(mocks).assertOwner('shop-1', 'user-1', false),
    ).resolves.toMatchObject({ id: 'shop-1' });
  });

  it('rejects a stranger', async () => {
    const mocks = prismaMock();
    mocks.marketShop.findUnique.mockResolvedValue(shopRow());
    await expect(
      service(mocks).assertOwner('shop-1', 'someone-else', false),
    ).rejects.toThrow(ForbiddenException);
  });

  it('lets an admin through', async () => {
    const mocks = prismaMock();
    mocks.marketShop.findUnique.mockResolvedValue(shopRow());
    await expect(
      service(mocks).assertOwner('shop-1', 'someone-else', true),
    ).resolves.toMatchObject({ id: 'shop-1' });
  });

  it('404s on a missing shop', async () => {
    const mocks = prismaMock();
    await expect(
      service(mocks).assertOwner('nope', 'user-1', true),
    ).rejects.toThrow(NotFoundException);
  });
});

describe('visibility', () => {
  it('hides a closed shop from everyone but the owner and an admin', async () => {
    const mocks = prismaMock();
    mocks.marketShop.findUnique.mockResolvedValue(shopRow({ status: 'closed' }));

    await expect(service(mocks).bySlug('lavka', 'stranger', false)).rejects.toThrow(
      NotFoundException,
    );
    await expect(service(mocks).bySlug('lavka', undefined, false)).rejects.toThrow(
      NotFoundException,
    );
    await expect(
      service(mocks).bySlug('lavka', 'user-1', false),
    ).resolves.toMatchObject({ slug: 'lavka', canEdit: true });
    await expect(
      service(mocks).bySlug('lavka', 'stranger', true),
    ).resolves.toMatchObject({ canEdit: true });
  });

  it('marks canEdit false for an ordinary visitor', async () => {
    const mocks = prismaMock();
    mocks.marketShop.findUnique.mockResolvedValue(shopRow());
    await expect(
      service(mocks).bySlug('lavka', 'stranger', false),
    ).resolves.toMatchObject({ canEdit: false });
  });

  // Блокировка в портале действует в обе стороны.
  it('hides a shop whose owner is blocked by the viewer', async () => {
    const mocks = prismaMock();
    mocks.marketShop.findUnique.mockResolvedValue(shopRow());
    mocks.userBlock.findFirst.mockResolvedValue({ blockerId: 'stranger' });
    await expect(service(mocks).bySlug('lavka', 'stranger', false)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('never hides a shop from its own owner', async () => {
    const mocks = prismaMock();
    mocks.marketShop.findUnique.mockResolvedValue(shopRow());
    mocks.userBlock.findFirst.mockResolvedValue({ blockerId: 'x' });
    await expect(
      service(mocks).bySlug('lavka', 'user-1', false),
    ).resolves.toMatchObject({ slug: 'lavka' });
  });
});

describe('blockedUserIds', () => {
  it('is empty for a guest and never queries', async () => {
    const mocks = prismaMock();
    await expect(service(mocks).blockedUserIds(undefined)).resolves.toEqual([]);
    expect(mocks.userBlock.findMany).not.toHaveBeenCalled();
  });

  it('collects the other side of the block in both directions', async () => {
    const mocks = prismaMock();
    mocks.userBlock.findMany.mockResolvedValue([
      { blockerId: 'me', blockedId: 'a' },
      { blockerId: 'b', blockedId: 'me' },
      { blockerId: 'me', blockedId: 'a' },
    ]);
    const ids = await service(mocks).blockedUserIds('me');
    expect(new Set(ids)).toEqual(new Set(['a', 'b']));
  });
});

describe('image upload', () => {
  it('reports unavailability instead of failing when S3 is off', async () => {
    const mocks = prismaMock();
    mocks.marketShop.findUnique.mockResolvedValue(shopRow());
    const images = {
      configured: false,
      validate: jest.fn().mockReturnValue(null),
      storeShopImage: jest.fn(),
    } as unknown as MarketImagesService;

    await expect(
      service(mocks, images).uploadImage('user-1', false, 'shop-1', 'logo', {
        buffer: Buffer.from(''),
        mimetype: 'image/png',
        size: 1,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('surfaces the validation code from the images service', async () => {
    const mocks = prismaMock();
    mocks.marketShop.findUnique.mockResolvedValue(shopRow());
    const images = {
      configured: true,
      validate: jest.fn().mockReturnValue('unsupported_image_type'),
      storeShopImage: jest.fn(),
    } as unknown as MarketImagesService;

    await expect(
      service(mocks, images).uploadImage('user-1', false, 'shop-1', 'cover', {
        buffer: Buffer.from(''),
        mimetype: 'image/gif',
        size: 1,
      }),
    ).rejects.toThrow('unsupported_image_type');
  });
});
