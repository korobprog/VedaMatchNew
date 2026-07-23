/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return */
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import sharp from 'sharp';
import {
  UserGalleryService,
  UploadedGalleryFile,
} from './user-gallery.service';

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn(),
}));

const USER_ID = 'user-id';
const NOW = new Date('2026-07-23T12:00:00.000Z');
const signedUrl = getSignedUrl as jest.MockedFunction<typeof getSignedUrl>;

describe('UserGalleryService', () => {
  let service: UserGalleryService;
  let prisma: ReturnType<typeof prismaMock>;
  let send: jest.SpiedFunction<S3Client['send']>;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = prismaMock();
    send = jest
      .spyOn(S3Client.prototype, 'send')
      .mockResolvedValue({} as never);
    signedUrl.mockImplementation((_client, command) =>
      Promise.resolve(`https://signed.test/${String(command.input.Key)}`),
    );
    service = createService(prisma);
  });

  afterEach(() => {
    send.mockRestore();
  });

  it.each([
    ['image/gif', Buffer.from('gif'), 'unsupported_type'],
    ['image/jpeg', Buffer.alloc(20 * 1024 * 1024 + 1), 'file_too_large'],
  ])(
    'rejects %s without aborting later files',
    async (mimetype, buffer, code) => {
      const result = await service.uploadMany(USER_ID, [
        file({ mimetype, buffer }),
        await validImageFile('image/jpeg'),
      ]);

      expect(result.failed[0].code).toBe(code);
      expect(result.uploaded).toHaveLength(1);
    },
  );

  it('rejects malformed bytes with an allowed MIME type', async () => {
    const result = await service.uploadMany(USER_ID, [
      file({ mimetype: 'image/png', buffer: Buffer.from('not an image') }),
    ]);

    expect(result.failed).toEqual([
      expect.objectContaining({ code: 'invalid_image' }),
    ]);
    expect(send).not.toHaveBeenCalled();
  });

  it.each(['image/jpeg', 'image/png', 'image/webp'])(
    'converts %s to metadata-free WebP and records processed dimensions',
    async (mimetype) => {
      const result = await service.uploadMany(USER_ID, [
        await validImageFile(mimetype),
      ]);

      const put = send.mock.calls[0][0] as PutObjectCommand;
      const metadata = await sharp(put.input.Body as Buffer).metadata();
      expect(metadata).toMatchObject({
        format: 'webp',
        width: 3,
        height: 2,
      });
      expect(metadata.exif).toBeUndefined();
      expect(prisma.userPhoto.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          width: 3,
          height: 2,
          sizeBytes: (put.input.Body as Buffer).length,
          isPublic: false,
        }),
      });
      expect(result.uploaded[0].photo).toMatchObject({
        width: 3,
        height: 2,
        isPublic: false,
      });
    },
  );

  it('applies EXIF orientation before recording dimensions', async () => {
    const buffer = await sharp({
      create: {
        width: 2,
        height: 3,
        channels: 3,
        background: '#ff0000',
      },
    })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer();

    const result = await service.uploadMany(USER_ID, [
      file({ mimetype: 'image/jpeg', buffer }),
    ]);

    expect(result.uploaded[0].photo).toMatchObject({ width: 3, height: 2 });
  });

  it('uploads private objects without an ACL and uses unique keys', async () => {
    await service.uploadMany(USER_ID, [
      await validImageFile('image/jpeg', 'a.jpg'),
      await validImageFile('image/jpeg', 'b.jpg'),
    ]);

    const first = send.mock.calls[0][0] as PutObjectCommand;
    const second = send.mock.calls[1][0] as PutObjectCommand;
    expect(first.input).toEqual(
      expect.objectContaining({
        Bucket: 'bucket',
        Key: expect.stringMatching(
          new RegExp(`^users/${USER_ID}/gallery/.+\\.webp$`),
        ),
        ContentType: 'image/webp',
        CacheControl: 'private, max-age=31536000, immutable',
      }),
    );
    expect(first.input).not.toHaveProperty('ACL');
    expect(first.input.Key).not.toBe(second.input.Key);
  });

  it.each([
    [undefined, 250 * 1024 * 1024],
    ['10', 10 * 1024 * 1024],
    ['0', 250 * 1024 * 1024],
    ['invalid', 250 * 1024 * 1024],
  ])('uses quota configuration %s', async (quota, expected) => {
    service = createService(prisma, { USER_GALLERY_QUOTA_MB: quota });

    const result = await service.getGallery(USER_ID);

    expect(result.quotaBytes).toBe(expected);
  });

  it('accounts against processed size and assigns MAX(sortOrder) + 1', async () => {
    prisma.userPhoto.aggregate
      .mockResolvedValueOnce({
        _sum: { sizeBytes: 100 },
        _max: { sortOrder: 7 },
      })
      .mockResolvedValueOnce({
        _sum: { sizeBytes: 180 },
        _max: { sortOrder: 8 },
      });

    const result = await service.uploadMany(USER_ID, [
      await validImageFile('image/png'),
    ]);

    const put = send.mock.calls[0][0] as PutObjectCommand;
    expect(prisma.userPhoto.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        sizeBytes: (put.input.Body as Buffer).length,
        sortOrder: 8,
      }),
    });
    expect(result.usedBytes).toBe(180);
  });

  it('locks the owner row before quota and ordering reads', async () => {
    await service.uploadMany(USER_ID, [await validImageFile('image/jpeg')]);

    expect(prisma.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      prisma.userPhoto.aggregate.mock.invocationCallOrder[0],
    );
  });

  it('compensates an uploaded object when quota is exceeded', async () => {
    service = createService(prisma, { USER_GALLERY_QUOTA_MB: '0.000001' });

    const result = await service.uploadMany(USER_ID, [
      await validImageFile('image/jpeg'),
    ]);

    expect(result.failed[0].code).toBe('quota_exceeded');
    expect(send.mock.calls[1][0]).toBeInstanceOf(DeleteObjectCommand);
    expect(prisma.userPhoto.create).not.toHaveBeenCalled();
  });

  it('compensates an uploaded object when the insert fails', async () => {
    prisma.userPhoto.create.mockRejectedValueOnce(new Error('db down'));

    const result = await service.uploadMany(USER_ID, [
      await validImageFile('image/jpeg'),
    ]);

    expect(result.failed[0].code).toBe('storage_error');
    expect(send.mock.calls[1][0]).toBeInstanceOf(DeleteObjectCommand);
  });

  it('keeps processing later files and preserves result order', async () => {
    send
      .mockRejectedValueOnce(new Error('first failed'))
      .mockResolvedValue({} as never);

    const result = await service.uploadMany(USER_ID, [
      await validImageFile('image/jpeg', 'first.jpg'),
      await validImageFile('image/png', 'second.png'),
      await validImageFile('image/webp', 'third.webp'),
    ]);

    expect(result.failed.map((entry) => entry.fileName)).toEqual(['first.jpg']);
    expect(result.uploaded.map((entry) => entry.fileName)).toEqual([
      'second.png',
      'third.webp',
    ]);
  });

  it('returns only signed GET URLs and never uses S3_PUBLIC_URL', async () => {
    prisma.userPhoto.findMany.mockResolvedValueOnce([
      photo({ storageKey: 'users/user-id/gallery/photo.webp' }),
    ]);
    service = createService(prisma, {
      S3_PUBLIC_URL: 'https://public.invalid',
    });

    const result = await service.getGallery(USER_ID);

    expect(result.photos[0].url).toBe(
      'https://signed.test/users/user-id/gallery/photo.webp',
    );
    expect(result.photos[0].url).not.toContain('public.invalid');
    expect(signedUrl).toHaveBeenCalledWith(
      expect.any(S3Client),
      expect.objectContaining({
        input: {
          Bucket: 'bucket',
          Key: 'users/user-id/gallery/photo.webp',
        },
      }),
      { expiresIn: 15 * 60 },
    );
  });

  it('signs public photo metadata in input order', async () => {
    const result = await service.signPublicPhotos([
      {
        id: 'a',
        storageKey: 'a.webp',
        width: 10,
        height: 20,
      },
      {
        id: 'b',
        storageKey: 'b.webp',
        width: 30,
        height: 40,
      },
    ]);

    expect(result).toEqual([
      { id: 'a', url: 'https://signed.test/a.webp', width: 10, height: 20 },
      { id: 'b', url: 'https://signed.test/b.webp', width: 30, height: 40 },
    ]);
  });

  it('rejects non-boolean visibility and enforces ownership', async () => {
    await expect(
      service.updateVisibility(USER_ID, 'photo-id', {
        isPublic: 'yes' as unknown as boolean,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    prisma.userPhoto.findFirst.mockResolvedValueOnce(null);
    await expect(
      service.updateVisibility(USER_ID, 'foreign-photo', { isPublic: true }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.userPhoto.findFirst).toHaveBeenCalledWith({
      where: { id: 'foreign-photo', userId: USER_ID },
    });
  });

  it('updates visibility only after an ownership lookup', async () => {
    prisma.userPhoto.findFirst.mockResolvedValueOnce(photo());
    prisma.userPhoto.update.mockResolvedValueOnce(photo({ isPublic: true }));

    const result = await service.updateVisibility(USER_ID, 'photo-id', {
      isPublic: true,
    });

    expect(prisma.userPhoto.update).toHaveBeenCalledWith({
      where: { id: 'photo-id' },
      data: { isPublic: true },
    });
    expect(result.isPublic).toBe(true);
  });

  it.each([
    [{ photoIds: ['a', 'a'] }, BadRequestException],
    [{ photoIds: ['a'] }, ConflictException],
    [{ photoIds: ['a', 'b', 'stale'] }, ConflictException],
    [{ photoIds: ['a', 'foreign'] }, ConflictException],
  ])('rejects invalid reorder body %#', async (body, errorType) => {
    prisma.userPhoto.findMany.mockResolvedValueOnce([{ id: 'a' }, { id: 'b' }]);

    await expect(service.reorder(USER_ID, body)).rejects.toBeInstanceOf(
      errorType,
    );
  });

  it('locks the owner and atomically updates every owned photo order', async () => {
    prisma.userPhoto.findMany
      .mockResolvedValueOnce([{ id: 'a' }, { id: 'b' }])
      .mockResolvedValueOnce([
        photo({ id: 'b', sortOrder: 0 }),
        photo({ id: 'a', sortOrder: 1 }),
      ]);

    const result = await service.reorder(USER_ID, {
      photoIds: ['b', 'a'],
    });

    expect(prisma.$queryRaw).toHaveBeenCalled();
    expect(prisma.userPhoto.update).toHaveBeenNthCalledWith(1, {
      where: { id: 'b' },
      data: { sortOrder: 0 },
    });
    expect(prisma.userPhoto.update).toHaveBeenNthCalledWith(2, {
      where: { id: 'a' },
      data: { sortOrder: 1 },
    });
    expect(result.photos.map((entry) => entry.id)).toEqual(['b', 'a']);
  });

  it('waits for the owner lock before reading or deleting a photo', async () => {
    let releaseOwnerLock!: () => void;
    prisma.$queryRaw.mockImplementationOnce(
      () =>
        new Promise<Array<{ id: string }>>((resolve) => {
          releaseOwnerLock = () => resolve([{ id: USER_ID }]);
        }),
    );
    prisma.userPhoto.findFirst.mockResolvedValueOnce(photo());

    const removal = service.remove(USER_ID, 'photo-id');

    await Promise.resolve();
    expect(prisma.userPhoto.findFirst).not.toHaveBeenCalled();
    expect(prisma.userPhoto.delete).not.toHaveBeenCalled();

    releaseOwnerLock();
    await expect(removal).resolves.toBeUndefined();

    expect(prisma.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      prisma.userPhoto.findFirst.mock.invocationCallOrder[0],
    );
    expect(prisma.userPhoto.findFirst.mock.invocationCallOrder[0]).toBeLessThan(
      prisma.userPhoto.delete.mock.invocationCallOrder[0],
    );
  });

  it('removes the DB row transactionally and does not resurrect it if S3 cleanup fails', async () => {
    prisma.userPhoto.findFirst.mockResolvedValueOnce(photo());
    send.mockRejectedValueOnce(new Error('S3 unavailable'));

    await expect(service.remove(USER_ID, 'photo-id')).resolves.toBeUndefined();

    expect(prisma.$transaction).toHaveBeenCalled();
    expect(prisma.userPhoto.delete).toHaveBeenCalledWith({
      where: { id: 'photo-id' },
    });
  });

  it('does not delete a photo owned by another user', async () => {
    prisma.userPhoto.findFirst.mockResolvedValueOnce(null);

    await expect(
      service.remove(USER_ID, 'foreign-photo'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.userPhoto.delete).not.toHaveBeenCalled();
  });
});

function createService(
  prisma: ReturnType<typeof prismaMock>,
  overrides: Record<string, string | undefined> = {},
) {
  const values: Record<string, string | undefined> = {
    S3_REGION: 'region',
    S3_ACCESS_KEY: 'access',
    S3_SECRET_KEY: 'secret',
    S3_ENDPOINT: 'https://s3.test',
    S3_BUCKET_NAME: 'bucket',
    ...overrides,
  };
  const config = {
    get: jest.fn((key: string) => values[key]),
  } as unknown as ConfigService;
  return new UserGalleryService(prisma as never, config);
}

function prismaMock() {
  const userPhoto = {
    aggregate: jest.fn().mockResolvedValue({
      _sum: { sizeBytes: 0 },
      _max: { sortOrder: null },
    }),
    create: jest
      .fn()
      .mockImplementation(({ data }: { data: Partial<PhotoRecord> }) =>
        Promise.resolve(
          photo({
            ...data,
            id: 'photo-id',
            createdAt: NOW,
            updatedAt: NOW,
          }),
        ),
      ),
    findMany: jest.fn().mockResolvedValue([]),
    findFirst: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };
  const prisma = {
    user: {
      findUnique: jest.fn().mockResolvedValue({ id: USER_ID }),
    },
    userPhoto,
    $queryRaw: jest.fn().mockResolvedValue([{ id: USER_ID }]),
    $transaction: jest.fn(
      (callback: (transaction: unknown) => Promise<unknown>) =>
        callback(prisma),
    ),
  };
  return prisma;
}

async function validImageFile(
  mimetype: string,
  originalname = `photo.${mimetype.split('/')[1]}`,
): Promise<UploadedGalleryFile> {
  const format = mimetype.split('/')[1] as 'jpeg' | 'png' | 'webp';
  const buffer = await sharp({
    create: {
      width: 3,
      height: 2,
      channels: 3,
      background: '#00ff00',
    },
  })
    .toFormat(format)
    .toBuffer();
  return file({ mimetype, originalname, buffer });
}

function file(
  overrides: Partial<UploadedGalleryFile> = {},
): UploadedGalleryFile {
  const buffer = overrides.buffer ?? Buffer.from('image');
  return {
    buffer,
    mimetype: 'image/jpeg',
    originalname: 'photo.jpg',
    size: buffer.length,
    ...overrides,
  };
}

interface PhotoRecord {
  id: string;
  userId: string;
  storageKey: string;
  sizeBytes: number;
  width: number;
  height: number;
  isPublic: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

function photo(overrides: Partial<PhotoRecord> = {}): PhotoRecord {
  return {
    id: 'photo-id',
    userId: USER_ID,
    storageKey: 'users/user-id/gallery/photo.webp',
    sizeBytes: 80,
    width: 3,
    height: 2,
    isPublic: false,
    sortOrder: 0,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}
