import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

/** Аватар кэшируется как immutable, поэтому подписываем надолго — до недели, максимум для SigV4. */
const AVATAR_SIGNED_URL_TTL_SECONDS = 7 * 24 * 60 * 60;

/**
 * Своя копия подписи аватара: контракт сервисного модуля запрещает
 * импортировать `UsersService`, а карточкам справочника ссылка на фото нужна
 * такая же, как в профиле портала.
 */
@Injectable()
export class PeopleAvatarService {
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

  /**
   * Аватар из Google OAuth — уже публичный URL, отдаём как есть. Загруженный
   * пользователем лежит в приватном бакете, и его нужно подписывать заново.
   */
  async resolveAvatarUrl(user: {
    avatarKey: string | null;
    avatarUrl: string | null;
  }): Promise<string | null> {
    if (!user.avatarKey) return user.avatarUrl;
    const bucket = this.config.get<string>('S3_BUCKET_NAME');
    if (!this.s3Client || !bucket) return null;
    return getSignedUrl(
      this.s3Client as unknown as Parameters<typeof getSignedUrl>[0],
      new GetObjectCommand({ Bucket: bucket, Key: user.avatarKey }),
      { expiresIn: AVATAR_SIGNED_URL_TTL_SECONDS },
    );
  }
}
