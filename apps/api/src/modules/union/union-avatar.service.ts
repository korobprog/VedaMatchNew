import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { toPublicStorageUrl } from '../../common/storage-public-url';
import {
  stableSignedTtl,
  stableSigningDate,
} from '../../common/stable-signing';

/** Аватар кэшируется как immutable, поэтому подписываем надолго — до недели, максимум для SigV4. */
const AVATAR_SIGNED_URL_TTL_SECONDS = 7 * 24 * 60 * 60;

/** Минимум выборки, по которому собирается ссылка на фото. */
export interface UnionAvatarRow {
  avatarKey: string | null;
  avatarUrl: string | null;
}

/**
 * Своя копия подписи аватара: контракт сервисного модуля запрещает
 * импортировать `UsersService`, а анкетам в архиве Union (VED-492) ссылка на фото
 * нужна такая же, как в портальном профиле. Устройство скопировано с
 * `BlogAvatarService` — по контракту хелперы дублируются, не импортируются.
 *
 * Загруженное фото лежит в приватном бакете: `avatarUrl` у него пуст, и без
 * подписи по `avatarKey` вместо фотографии оставался пустой кружок.
 */
@Injectable()
export class UnionAvatarService {
  private readonly s3Client: S3Client | null;

  constructor(private readonly config: ConfigService) {
    const region = this.config.get<string>('S3_REGION');
    const accessKeyId = this.config.get<string>('S3_ACCESS_KEY');
    const secretAccessKey = this.config.get<string>('S3_SECRET_KEY');
    const endpoint = this.config.get<string>('S3_ENDPOINT');

    this.s3Client =
      region && accessKeyId && secretAccessKey
        ? new S3Client({
            region,
            endpoint: endpoint || undefined,
            forcePathStyle: Boolean(endpoint),
            credentials: { accessKeyId, secretAccessKey },
          })
        : null;
  }

  async resolveAvatarUrl(user: UnionAvatarRow): Promise<string | null> {
    if (!user.avatarKey) return user.avatarUrl;
    const bucket = this.config.get<string>('S3_BUCKET_NAME');
    if (!this.s3Client || !bucket) return null;
    return getSignedUrl(
      this.s3Client as unknown as Parameters<typeof getSignedUrl>[0],
      new GetObjectCommand({ Bucket: bucket, Key: user.avatarKey }),
      // Одна ссылка на сутки (VED-498): иначе браузер качал аватарку заново
      // на каждой странице — подпись «сейчас» каждый раз новая.
      {
        expiresIn: stableSignedTtl(AVATAR_SIGNED_URL_TTL_SECONDS),
        signingDate: stableSigningDate(),
      },
    ).then((url) =>
      toPublicStorageUrl(
        url,
        this.config.get<string>('S3_ENDPOINT'),
        this.config.get<string>('S3_PUBLIC_URL'),
      ),
    );
  }

  /**
   * Подписать фото всех людей ответа за один проход, прямо в строках выборки:
   * `avatarUrl` у кого есть `avatarKey` заменяется подписанной ссылкой, и
   * сборка DTO дальше берёт его как раньше. Один человек встречается в ответе
   * много раз (автор, исполнитель, участник) — подпись по разу на ключ.
   */
  async signAvatars(
    users: Iterable<UnionAvatarRow | null | undefined>,
  ): Promise<void> {
    const signed = new Map<string, string | null>();
    for (const user of users) {
      if (!user?.avatarKey) continue;
      if (!signed.has(user.avatarKey))
        signed.set(user.avatarKey, await this.resolveAvatarUrl(user));
      user.avatarUrl = signed.get(user.avatarKey) ?? null;
    }
  }
}
