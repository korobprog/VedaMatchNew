import type { ConfigService } from '@nestjs/config';
import { WorkAvatarService } from './work-avatar.service';

const S3 = {
  S3_REGION: 'ru-1',
  S3_ACCESS_KEY: 'key',
  S3_SECRET_KEY: 'secret',
  S3_BUCKET_NAME: 'vedamatch',
  S3_ENDPOINT: 'https://s3.example.test',
} as Record<string, string | undefined>;

function build(env: Record<string, string | undefined>) {
  return new WorkAvatarService({
    get: (name: string) => env[name],
  } as unknown as ConfigService);
}

describe('WorkAvatarService (VED-492)', () => {
  it('фото из Google отдаётся как есть', async () => {
    await expect(
      build(S3).resolveAvatarUrl({
        avatarKey: null,
        avatarUrl: 'https://google/a.jpg',
      }),
    ).resolves.toBe('https://google/a.jpg');
  });

  it('загруженное фото подписывается по ключу', async () => {
    const url = await build(S3).resolveAvatarUrl({
      avatarKey: 'avatars/a.webp',
      avatarUrl: null,
    });
    expect(url).toContain('avatars/a.webp');
    expect(url).toContain('X-Amz-Signature=');
  });

  it('без хранилища — пусто, а не битая ссылка', async () => {
    await expect(
      build({}).resolveAvatarUrl({
        avatarKey: 'avatars/a.webp',
        avatarUrl: null,
      }),
    ).resolves.toBeNull();
  });

  it('signAvatars подписывает в строках, по разу на ключ', async () => {
    const service = build(S3);
    const resolve = jest.spyOn(service, 'resolveAvatarUrl');
    const anna = { avatarKey: 'avatars/a.webp', avatarUrl: null };
    const annaAgain = { avatarKey: 'avatars/a.webp', avatarUrl: null };
    const google = { avatarKey: null, avatarUrl: 'https://google/b.jpg' };

    await service.signAvatars([anna, null, annaAgain, google, undefined]);

    expect(anna.avatarUrl).toContain('X-Amz-Signature=');
    expect(annaAgain.avatarUrl).toBe(anna.avatarUrl);
    expect(google.avatarUrl).toBe('https://google/b.jpg');
    expect(resolve).toHaveBeenCalledTimes(1);
  });
});
