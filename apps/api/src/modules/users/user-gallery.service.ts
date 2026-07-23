import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Prisma, UserPhoto } from '@prisma/client';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type {
  ReorderUserPhotosRequest,
  UnionPhoto,
  UpdateUserPhotoRequest,
  UserGalleryState,
  UserPhotoDto,
  UserPhotoUploadFailure,
  UserPhotoUploadFailureCode,
  UserPhotoUploadResponse,
} from '@vedamatch/shared';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { PrismaService } from '../../prisma/prisma.service';

const MAX_FILE_BYTES = 20 * 1024 * 1024;
const DEFAULT_QUOTA_MB = 250;
const SIGNED_URL_TTL_SECONDS = 15 * 60;
const ACCEPTED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export interface UploadedGalleryFile {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size: number;
}

interface ProcessedGalleryFile {
  data: Buffer;
  width: number;
  height: number;
}

class GalleryQuotaError extends Error {}

@Injectable()
export class UserGalleryService {
  private readonly logger = new Logger(UserGalleryService.name);
  private readonly s3Client: S3Client | null;
  private readonly bucket: string | undefined;
  private readonly quotaBytes: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    const region = this.config.get<string>('S3_REGION');
    const accessKeyId = this.config.get<string>('S3_ACCESS_KEY');
    const secretAccessKey = this.config.get<string>('S3_SECRET_KEY');
    const endpoint = this.config.get<string>('S3_ENDPOINT');

    this.bucket = this.config.get<string>('S3_BUCKET_NAME');
    this.s3Client =
      region && accessKeyId && secretAccessKey
        ? new S3Client({
            region,
            endpoint: endpoint || undefined,
            forcePathStyle: Boolean(endpoint),
            credentials: { accessKeyId, secretAccessKey },
          })
        : null;
    this.quotaBytes = resolveQuotaBytes(
      this.config.get<string>('USER_GALLERY_QUOTA_MB'),
    );
  }

  async getGallery(userId: string): Promise<UserGalleryState> {
    await this.ensureUser(userId);
    return this.loadGallery(userId);
  }

  async uploadMany(
    userId: string,
    files: UploadedGalleryFile[],
  ): Promise<UserPhotoUploadResponse> {
    await this.ensureUser(userId);
    const uploaded: UserPhotoUploadResponse['uploaded'] = [];
    const failed: UserPhotoUploadFailure[] = [];

    for (const file of files) {
      const validationFailure = this.validateFile(file);
      if (validationFailure) {
        failed.push(validationFailure);
        continue;
      }

      const processed = await this.processFile(file);
      if ('failure' in processed) {
        failed.push(processed.failure);
        continue;
      }

      if (!this.s3Client || !this.bucket) {
        failed.push(
          failure(file, 'storage_error', 'S3-хранилище галереи не настроено'),
        );
        continue;
      }

      const storageKey = `users/${userId}/gallery/${randomUUID()}.webp`;
      try {
        await this.s3Client.send(
          new PutObjectCommand({
            Bucket: this.bucket,
            Key: storageKey,
            Body: processed.data,
            ContentType: 'image/webp',
            CacheControl: 'private, max-age=31536000, immutable',
          }),
        );
      } catch {
        failed.push(
          failure(file, 'storage_error', 'Не удалось сохранить фотографию'),
        );
        continue;
      }

      try {
        const photo = await this.prisma.$transaction(async (tx) => {
          await this.lockOwner(tx, userId);
          const totals = await tx.userPhoto.aggregate({
            where: { userId },
            _sum: { sizeBytes: true },
            _max: { sortOrder: true },
          });
          const usedBytes = totals._sum.sizeBytes ?? 0;
          if (usedBytes + processed.data.length > this.quotaBytes) {
            throw new GalleryQuotaError();
          }

          return tx.userPhoto.create({
            data: {
              userId,
              storageKey,
              sizeBytes: processed.data.length,
              width: processed.width,
              height: processed.height,
              isPublic: false,
              sortOrder: (totals._max.sortOrder ?? -1) + 1,
            },
          });
        });

        uploaded.push({
          fileName: file.originalname,
          photo: await this.toDto(photo),
        });
      } catch (error) {
        await this.deleteObject(storageKey, 'компенсации загрузки');
        failed.push(
          error instanceof GalleryQuotaError
            ? failure(
                file,
                'quota_exceeded',
                'Превышен лимит хранилища галереи',
              )
            : failure(
                file,
                'storage_error',
                'Не удалось сохранить данные фотографии',
              ),
        );
      }
    }

    const usedBytes = await this.usedBytes(userId);
    return { uploaded, failed, usedBytes, quotaBytes: this.quotaBytes };
  }

  async updateVisibility(
    userId: string,
    photoId: string,
    body: UpdateUserPhotoRequest,
  ): Promise<UserPhotoDto> {
    if (typeof body?.isPublic !== 'boolean') {
      throw new BadRequestException('isPublic должен быть boolean');
    }

    await this.findOwnedPhoto(userId, photoId);
    const photo = await this.prisma.userPhoto.update({
      where: { id: photoId },
      data: { isPublic: body.isPublic },
    });
    return this.toDto(photo);
  }

  async reorder(
    userId: string,
    body: ReorderUserPhotosRequest,
  ): Promise<UserGalleryState> {
    const photoIds = body?.photoIds;
    if (
      !Array.isArray(photoIds) ||
      photoIds.some((id) => typeof id !== 'string')
    ) {
      throw new BadRequestException('photoIds должен быть массивом строк');
    }
    if (new Set(photoIds).size !== photoIds.length) {
      throw new BadRequestException('photoIds не должен содержать дубликаты');
    }

    await this.prisma.$transaction(async (tx) => {
      await this.lockOwner(tx, userId);
      const owned = await tx.userPhoto.findMany({
        where: { userId },
        select: { id: true },
      });
      const ownedIds = new Set(owned.map((photo) => photo.id));
      if (
        ownedIds.size !== photoIds.length ||
        photoIds.some((id) => !ownedIds.has(id))
      ) {
        throw new ConflictException(
          'Состав галереи изменился, обновите страницу',
        );
      }

      await Promise.all(
        photoIds.map((id, sortOrder) =>
          tx.userPhoto.update({
            where: { id },
            data: { sortOrder },
          }),
        ),
      );
    });

    return this.loadGallery(userId);
  }

  async remove(userId: string, photoId: string): Promise<void> {
    const deleted = await this.prisma.$transaction(async (tx) => {
      await this.lockOwner(tx, userId);
      const photo = await tx.userPhoto.findFirst({
        where: { id: photoId, userId },
      });
      if (!photo) throw new NotFoundException('Фотография не найдена');
      await tx.userPhoto.delete({ where: { id: photoId } });
      return photo;
    });

    await this.deleteObject(deleted.storageKey, 'удаления фотографии');
  }

  async signPublicPhotos(
    photos: Array<Pick<UserPhoto, 'id' | 'storageKey' | 'width' | 'height'>>,
  ): Promise<UnionPhoto[]> {
    return Promise.all(
      photos.map(async (photo) => ({
        id: photo.id,
        url: await this.signStorageKey(photo.storageKey),
        width: photo.width,
        height: photo.height,
      })),
    );
  }

  private validateFile(
    file: UploadedGalleryFile,
  ): UserPhotoUploadFailure | null {
    if (!ACCEPTED_MIME_TYPES.has(file.mimetype)) {
      return failure(
        file,
        'unsupported_type',
        'Разрешены только JPEG, PNG и WebP',
      );
    }
    if (file.size > MAX_FILE_BYTES || file.buffer.length > MAX_FILE_BYTES) {
      return failure(
        file,
        'file_too_large',
        'Размер фотографии не должен превышать 20 MB',
      );
    }
    return null;
  }

  private async processFile(
    file: UploadedGalleryFile,
  ): Promise<ProcessedGalleryFile | { failure: UserPhotoUploadFailure }> {
    try {
      await sharp(file.buffer, {
        failOn: 'error',
        limitInputPixels: true,
      }).metadata();
    } catch {
      return {
        failure: failure(
          file,
          'invalid_image',
          'Файл не является корректным изображением',
        ),
      };
    }

    try {
      const output = await sharp(file.buffer, {
        failOn: 'error',
        limitInputPixels: true,
      })
        .rotate()
        .webp()
        .toBuffer({ resolveWithObject: true });
      if (!output.info.width || !output.info.height) {
        throw new Error('Missing output dimensions');
      }
      return {
        data: output.data,
        width: output.info.width,
        height: output.info.height,
      };
    } catch {
      return {
        failure: failure(
          file,
          'processing_failed',
          'Не удалось обработать фотографию',
        ),
      };
    }
  }

  private async loadGallery(userId: string): Promise<UserGalleryState> {
    const [photos, usedBytes] = await Promise.all([
      this.prisma.userPhoto.findMany({
        where: { userId },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      }),
      this.usedBytes(userId),
    ]);
    return {
      photos: await Promise.all(photos.map((photo) => this.toDto(photo))),
      usedBytes,
      quotaBytes: this.quotaBytes,
    };
  }

  private async usedBytes(userId: string): Promise<number> {
    const totals = await this.prisma.userPhoto.aggregate({
      where: { userId },
      _sum: { sizeBytes: true },
    });
    return totals._sum.sizeBytes ?? 0;
  }

  private async toDto(photo: UserPhoto): Promise<UserPhotoDto> {
    return {
      id: photo.id,
      url: await this.signStorageKey(photo.storageKey),
      sizeBytes: photo.sizeBytes,
      width: photo.width,
      height: photo.height,
      isPublic: photo.isPublic,
      sortOrder: photo.sortOrder,
      createdAt: photo.createdAt.toISOString(),
      updatedAt: photo.updatedAt.toISOString(),
    };
  }

  private async signStorageKey(storageKey: string): Promise<string> {
    if (!this.s3Client || !this.bucket) {
      throw new BadRequestException('S3-хранилище галереи не настроено');
    }
    return getSignedUrl(
      this.s3Client as unknown as Parameters<typeof getSignedUrl>[0],
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: storageKey,
      }),
      { expiresIn: SIGNED_URL_TTL_SECONDS },
    );
  }

  private async ensureUser(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!user) throw new NotFoundException('Пользователь не найден');
  }

  private async findOwnedPhoto(
    userId: string,
    photoId: string,
  ): Promise<UserPhoto> {
    const photo = await this.prisma.userPhoto.findFirst({
      where: { id: photoId, userId },
    });
    if (!photo) throw new NotFoundException('Фотография не найдена');
    return photo;
  }

  private async lockOwner(
    tx: Prisma.TransactionClient,
    userId: string,
  ): Promise<void> {
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE
    `;
    if (rows.length === 0) {
      throw new NotFoundException('Пользователь не найден');
    }
  }

  private async deleteObject(
    storageKey: string,
    context: string,
  ): Promise<void> {
    if (!this.s3Client || !this.bucket) return;
    try {
      await this.s3Client.send(
        new DeleteObjectCommand({
          Bucket: this.bucket,
          Key: storageKey,
        }),
      );
    } catch (error) {
      this.logger.warn(
        `Не удалось удалить объект галереи при ${context}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}

function resolveQuotaBytes(value: string | undefined): number {
  const quotaMb = Number(value);
  const effectiveQuotaMb =
    Number.isFinite(quotaMb) && quotaMb > 0 ? quotaMb : DEFAULT_QUOTA_MB;
  return Math.floor(effectiveQuotaMb * 1024 * 1024);
}

function failure(
  file: UploadedGalleryFile,
  code: UserPhotoUploadFailureCode,
  message: string,
): UserPhotoUploadFailure {
  return { fileName: file.originalname, code, message };
}
