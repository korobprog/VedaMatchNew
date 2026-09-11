import { BadRequestException, ForbiddenException } from '@nestjs/common';
import type { AccessTokenPayload } from '@vedamatch/shared';
import sharp from 'sharp';
import { MotivationPicturesService } from './motivation-pictures.service';

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

interface CreatedPost {
  id: string;
  slug: string;
  publishedAt: Date;
  attributionSpeaker: string | null;
  translations: { create: Array<Record<string, string>> };
}

/** Что сервис передал в `motivationPost.create`. */
function createdData(create: jest.Mock): CreatedPost {
  return (create.mock.calls[0] as [{ data: CreatedPost }])[0].data;
}

async function png(width: number, height: number) {
  const buffer = await sharp({
    create: { width, height, channels: 3, background: '#335577' },
  })
    .png()
    .toBuffer();
  return { buffer, mimetype: 'image/png', size: buffer.length };
}

function build({
  resolveSlug = jest.fn().mockResolvedValue('shastra'),
}: { resolveSlug?: jest.Mock } = {}) {
  const create = jest
    .fn()
    .mockImplementation(({ data }: { data: { id: string; slug: string } }) =>
      Promise.resolve({ id: data.id, slug: data.slug }),
    );
  const audit = jest.fn().mockResolvedValue({});
  const uploadStory = jest
    .fn()
    .mockImplementation((key: string) => Promise.resolve(`https://cdn/${key}`));
  const service = new MotivationPicturesService(
    {
      motivationCategory: {
        findUnique: jest.fn().mockResolvedValue({ title: 'Шастры' }),
      },
      motivationPost: { create },
      motivationModerationAudit: { create: audit },
    } as never,
    { resolveSlug } as never,
    { uploadStory } as never,
  );
  return { service, create, audit, uploadStory, resolveSlug };
}

describe('MotivationPicturesService.create', () => {
  it('lets only a motivation admin in', async () => {
    const { service, create } = build();

    await expect(
      service.create(regularUser, await png(800, 800), {}),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(create).not.toHaveBeenCalled();
  });

  it('answers a missing file with a readable error', async () => {
    const { service } = build();

    await expect(service.create(admin, undefined, {})).rejects.toThrow(
      'Выберите файл с картинкой',
    );
  });

  it('publishes the picture straight into the chosen category', async () => {
    const { service, create, audit, resolveSlug } = build();

    const result = await service.create(admin, await png(800, 1000), {
      category: 'shastra',
      text: 'Кто видит меня везде',
      author: 'Шри Кришна',
    });

    expect(resolveSlug).toHaveBeenCalledWith('shastra');
    const data = createdData(create);
    expect(data).toMatchObject({
      category: 'shastra',
      status: 'published',
      reviewStatus: 'published',
      origin: 'editorial',
      imageSource: 'uploaded',
      captionInImage: true,
      storyCaption: false,
      sourceVerified: true,
      authorUserId: 'admin-1',
      attributionSpeaker: 'Шри Кришна',
      imageUrl: result.imageUrl,
      storyImageUrl: result.imageUrl,
    });
    expect(data.publishedAt).toBeInstanceOf(Date);
    // Надпись на картинке одна на все языки: без перевода читатель с
    // английским интерфейсом получил бы пустой заголовок.
    expect(data.translations.create).toEqual(
      ['ru', 'en', 'hi'].map((language) => ({
        language,
        title: 'Кто видит меня везде',
        text: 'Кто видит меня везде',
        storyText: 'Кто видит меня везде',
      })),
    );
    expect(result).toMatchObject({
      postId: data.id,
      slug: `picture-${data.id}`,
      category: 'shastra',
    });
    const [{ data: auditData }] = audit.mock.calls[0] as [
      { data: Record<string, unknown> },
    ];
    expect(auditData).toMatchObject({
      postId: data.id,
      actorId: 'admin-1',
      action: 'admin_picture',
    });
  });

  // Обрезка под 9:16 срезала бы края надписи — кадр только уменьшается.
  it('keeps the whole picture and only scales it down', async () => {
    const { service, uploadStory } = build();

    await service.create(admin, await png(3000, 1000), {});

    const [key, bytes, type] = uploadStory.mock.calls[0] as [
      string,
      Buffer,
      string,
    ];
    expect(key).toMatch(/^motivation\/pictures\/[0-9a-f-]+\/v\d+\.webp$/);
    expect(type).toBe('image/webp');
    const meta = await sharp(bytes).metadata();
    expect(meta.format).toBe('webp');
    expect(meta.width).toBe(2048);
    expect(meta.height).toBe(683);
  });

  it('names the category in the title when no text was typed', async () => {
    const { service, create } = build();

    await service.create(admin, await png(800, 800), {});

    const data = createdData(create);
    expect(data.translations.create[0]).toMatchObject({
      title: 'Картинка из раздела «Шастры»',
      text: '',
    });
    expect(data.attributionSpeaker).toBeNull();
  });

  it('refuses a picture too small to read', async () => {
    const { service, create, uploadStory } = build();

    await expect(
      service.create(admin, await png(300, 900), {}),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(uploadStory).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  // Опечатка в слаге не должна тихо уронить картинку в чужой раздел.
  it('stores nothing when the category is unknown', async () => {
    const { service, uploadStory, create } = build({
      resolveSlug: jest
        .fn()
        .mockRejectedValue(new BadRequestException('Unknown category')),
    });

    await expect(
      service.create(admin, await png(800, 800), { category: 'nope' }),
    ).rejects.toThrow('Unknown category');
    expect(uploadStory).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it('refuses an overlong text before touching storage', async () => {
    const { service, uploadStory } = build();

    await expect(
      service.create(admin, await png(800, 800), { text: 'а'.repeat(601) }),
    ).rejects.toThrow('Текст длиннее 600 знаков');
    expect(uploadStory).not.toHaveBeenCalled();
  });
});
