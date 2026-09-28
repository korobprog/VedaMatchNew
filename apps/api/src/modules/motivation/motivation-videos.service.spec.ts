import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import type { AccessTokenPayload } from '@vedamatch/shared';
import { MotivationVideosService } from './motivation-videos.service';
import { decodeVideoCursor } from './video-feed';

const admin = {
  sub: 'admin-1',
  email: 'admin@example.com',
  role: 'admin',
} as AccessTokenPayload;
const regularUser = {
  sub: 'user-1',
  email: 'user@example.com',
  role: 'user',
} as AccessTokenPayload;

function box(type: string, payload: Buffer): Buffer {
  const header = Buffer.alloc(8);
  header.writeUInt32BE(payload.length + 8, 0);
  header.write(type, 4, 'latin1');
  return Buffer.concat([header, payload]);
}

function mp4(seconds: number) {
  const mvhd = Buffer.alloc(20);
  mvhd.writeUInt32BE(1000, 12);
  mvhd.writeUInt32BE(seconds * 1000, 16);
  const buffer = Buffer.concat([
    box('ftyp', Buffer.from('isom\0\0\0\0', 'latin1')),
    box('moov', box('mvhd', mvhd)),
  ]);
  return { buffer, mimetype: 'video/mp4', size: buffer.length };
}

type Created = {
  id: string;
  url: string;
  title: string;
  category: string;
  durationSeconds: number;
  uploadedById: string;
};

function build(rows: unknown[] = []) {
  const create = jest.fn().mockImplementation(({ data }: { data: Created }) =>
    Promise.resolve({
      id: data.id,
      url: data.url,
      title: data.title,
      category: data.category,
      durationSeconds: data.durationSeconds,
      createdAt: new Date('2026-09-28T00:00:00.000Z'),
    }),
  );
  const findMany = jest.fn().mockResolvedValue(rows);
  const findUnique = jest.fn().mockResolvedValue(null);
  const remove = jest.fn().mockResolvedValue({});
  const resolveSlug = jest.fn().mockResolvedValue('vedy');
  const uploadStory = jest
    .fn()
    .mockImplementation((key: string) => Promise.resolve(`https://cdn/${key}`));
  const prisma = {
    motivationVideo: { create, findMany, findUnique, delete: remove },
    motivationCategory: {
      findMany: jest.fn().mockResolvedValue([{ slug: 'vedy', title: 'Веды' }]),
    },
  };
  const service = new MotivationVideosService(
    prisma as never,
    { resolveSlug } as never,
    { uploadStory } as never,
  );
  return {
    service,
    create,
    findMany,
    findUnique,
    remove,
    resolveSlug,
    uploadStory,
  };
}

describe('MotivationVideosService.create', () => {
  it('редакция загружает ролик — он сразу в ленте со своей категорией', async () => {
    const { service, create, resolveSlug, uploadStory } = build();
    const dto = await service.create(admin, mp4(12), {
      category: 'vedy',
      title: ' Утро ',
    });
    expect(resolveSlug).toHaveBeenCalledWith('vedy');
    const [key, , type] = uploadStory.mock.calls[0] as [string, Buffer, string];
    expect(key).toMatch(/^motivation\/videos\/.+\.mp4$/);
    expect(type).toBe('video/mp4');
    const [{ data }] = create.mock.calls[0] as [{ data: Created }];
    expect(data).toMatchObject({
      category: 'vedy',
      title: 'Утро',
      durationSeconds: 12,
      uploadedById: 'admin-1',
    });
    expect(dto).toMatchObject({ categoryTitle: 'Веды', durationSeconds: 12 });
  });

  it('участнику нельзя', async () => {
    const { service, uploadStory } = build();
    await expect(service.create(regularUser, mp4(5), {})).rejects.toThrow(
      ForbiddenException,
    );
    expect(uploadStory).not.toHaveBeenCalled();
  });

  it('длинный ролик не доходит до хранилища', async () => {
    const { service, uploadStory } = build();
    await expect(service.create(admin, mp4(600), {})).rejects.toThrow(
      BadRequestException,
    );
    expect(uploadStory).not.toHaveBeenCalled();
  });
});

describe('MotivationVideosService.list', () => {
  it('фильтрует по папке и отдаёт курсор следующей страницы', async () => {
    const rows = [3, 2, 1].map((n) => ({
      id: `v${n}`,
      url: `https://cdn/${n}.mp4`,
      title: '',
      category: 'vedy',
      durationSeconds: 10,
      createdAt: new Date(Date.UTC(2026, 8, n)),
    }));
    const { service, findMany } = build(rows);
    const page = await service.list({ category: 'vedy', limit: '2' });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { category: 'vedy' }, take: 3 }),
    );
    expect(page.items.map((item) => item.id)).toEqual(['v3', 'v2']);
    expect(page.items[0].categoryTitle).toBe('Веды');
    expect(decodeVideoCursor(page.nextCursor)?.id).toBe('v2');
  });
});

describe('MotivationVideosService.remove', () => {
  it('чужой id — 404, участнику — 403', async () => {
    const { service, remove } = build();
    await expect(service.remove(admin, 'nope')).rejects.toThrow(
      NotFoundException,
    );
    await expect(service.remove(regularUser, 'nope')).rejects.toThrow(
      ForbiddenException,
    );
    expect(remove).not.toHaveBeenCalled();
  });
});
