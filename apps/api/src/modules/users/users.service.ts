import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import {
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import type {
  ProfileLocation,
  ProfileMessengers,
  ProfileSocialLinks,
  ProfileUpdateRequest,
  UserProfile,
} from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { toRole } from '../auth/auth.service';

const MAX_AVATAR_SIZE = 5 * 1024 * 1024;
const AVATAR_MIME_EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};
const SOCIAL_KEYS: Array<keyof ProfileSocialLinks> = [
  'instagram',
  'telegram',
  'x',
  'facebook',
  'linkedin',
  'vk',
  'tiktok',
  'youtube',
  'website',
];
const MESSENGER_KEYS: Array<keyof ProfileMessengers> = [
  'telegram',
  'whatsapp',
  'mx',
  'phone',
];

export interface UploadedAvatarFile {
  buffer: Buffer;
  mimetype: string;
  originalname?: string;
  size: number;
}

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);
  private readonly s3Client: S3Client | null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
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

  async getProfile(userId: string): Promise<UserProfile> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Пользователь не найден');
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl,
      avatarKey: user.avatarKey,
      homeLocation: parseLocation(user.homeLocation),
      socialLinks: parseSocialLinks(user.socialLinks),
      messengers: parseMessengers(user.messengers),
      role: toRole(user.role),
      spiritualStage: user.spiritualStage,
      devoteeVerificationStatus: user.devoteeVerificationStatus,
      lastSelfIdentificationAt:
        user.lastSelfIdentificationAt?.toISOString() ?? null,
    };
  }

  async updateProfile(
    userId: string,
    payload: ProfileUpdateRequest,
  ): Promise<UserProfile> {
    await this.ensureUser(userId);

    const data: Prisma.UserUpdateInput = {};

    if ('homeLocation' in payload) {
      data.homeLocation = payload.homeLocation
        ? (sanitizeLocation(
            payload.homeLocation,
          ) as unknown as Prisma.InputJsonObject)
        : Prisma.DbNull;
    }
    if ('socialLinks' in payload) {
      data.socialLinks = sanitizeKeyValueMap(
        payload.socialLinks,
        SOCIAL_KEYS,
      ) as unknown as Prisma.InputJsonObject;
    }
    if ('messengers' in payload) {
      data.messengers = sanitizeKeyValueMap(
        payload.messengers,
        MESSENGER_KEYS,
      ) as unknown as Prisma.InputJsonObject;
    }

    await this.prisma.user.update({ where: { id: userId }, data });
    return this.getProfile(userId);
  }

  async uploadAvatar(
    userId: string,
    file: UploadedAvatarFile | undefined,
  ): Promise<UserProfile> {
    if (!file) throw new BadRequestException('Файл аватара не передан');
    const extension = AVATAR_MIME_EXTENSIONS[file.mimetype];
    if (!extension) {
      throw new BadRequestException('Разрешены только jpg, jpeg, png и webp');
    }
    if (file.size > MAX_AVATAR_SIZE) {
      throw new BadRequestException('Размер аватара не должен превышать 5 MB');
    }

    const bucket = this.config.get<string>('S3_BUCKET_NAME');
    const publicUrl = this.config.get<string>('S3_PUBLIC_URL');
    if (!this.s3Client || !bucket || !publicUrl) {
      throw new BadRequestException('S3-хранилище не настроено');
    }

    const user = await this.ensureUser(userId);
    const key = `users/${userId}/avatar.${extension}`;
    await this.s3Client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype,
        CacheControl: 'public, max-age=31536000, immutable',
      }),
    );

    if (user.avatarKey && user.avatarKey !== key) {
      await this.deleteAvatarObject(user.avatarKey);
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        avatarKey: key,
        avatarUrl: buildPublicUrl(publicUrl, key),
      },
    });

    return this.getProfile(userId);
  }

  async deleteAvatar(userId: string): Promise<UserProfile> {
    const user = await this.ensureUser(userId);
    if (user.avatarKey) await this.deleteAvatarObject(user.avatarKey);
    await this.prisma.user.update({
      where: { id: userId },
      data: { avatarKey: null, avatarUrl: null },
    });
    return this.getProfile(userId);
  }

  private async ensureUser(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Пользователь не найден');
    return user;
  }

  private async deleteAvatarObject(key: string) {
    const bucket = this.config.get<string>('S3_BUCKET_NAME');
    if (!this.s3Client || !bucket) return;
    try {
      await this.s3Client.send(
        new DeleteObjectCommand({ Bucket: bucket, Key: key }),
      );
    } catch (error) {
      this.logger.warn(
        `Не удалось удалить старый аватар из S3: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}

function parseLocation(value: unknown): ProfileLocation | null {
  if (!value || typeof value !== 'object') return null;
  try {
    return sanitizeLocation(value as ProfileLocation);
  } catch {
    return null;
  }
}

function parseSocialLinks(value: unknown): ProfileSocialLinks {
  return sanitizeKeyValueMap(value as ProfileSocialLinks, SOCIAL_KEYS);
}

function parseMessengers(value: unknown): ProfileMessengers {
  return sanitizeKeyValueMap(value as ProfileMessengers, MESSENGER_KEYS);
}

function sanitizeLocation(location: ProfileLocation): ProfileLocation {
  const city = sanitizeString(location.city, 120);
  if (!city) throw new BadRequestException('Укажите город');

  const lat = Number(location.lat);
  const lon = Number(location.lon);
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
    throw new BadRequestException('Некорректная широта');
  }
  if (!Number.isFinite(lon) || lon < -180 || lon > 180) {
    throw new BadRequestException('Некорректная долгота');
  }

  return {
    city,
    country: sanitizeString(location.country, 120) || undefined,
    lat: roundCoordinate(lat),
    lon: roundCoordinate(lon),
    displayName: sanitizeString(location.displayName, 240) || undefined,
  };
}

function sanitizeKeyValueMap<T extends object>(
  value: T | null | undefined,
  keys: readonly string[],
): T {
  const result: Record<string, string> = {};
  if (!value || typeof value !== 'object') return result as T;
  const source = value as Record<string, unknown>;

  for (const key of keys) {
    const sanitized = sanitizeString(source[key], 300);
    if (!sanitized) continue;
    if (key === 'phone' && !/^\+[1-9]\d{6,14}$/.test(sanitized)) {
      throw new BadRequestException(
        'Телефон должен быть в международном формате',
      );
    }
    result[String(key)] = sanitized;
  }

  return result as T;
}

function sanitizeString(value: unknown, maxLength: number): string {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLength);
}

function roundCoordinate(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function buildPublicUrl(publicUrl: string, key: string): string {
  return `${publicUrl.replace(/\/+$/, '')}/${key
    .split('/')
    .map(encodeURIComponent)
    .join('/')}`;
}
