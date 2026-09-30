import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  BlogAlbumPhotoDto,
  BlogAlbumResponse,
  BlogAlbumUploadResponse,
  BlogImageRejection,
  UpdateBlogAlbumPhotoRequest,
} from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { ModerationService } from '../moderation/moderation.service';
import { albumFileDenial, parseAlbumCaption } from './blog-album';
import {
  BlogImagesService,
  type UploadedImageFile,
} from './blog-images.service';

interface PhotoRow {
  id: string;
  url: string;
  width: number | null;
  height: number | null;
  caption: string | null;
  createdAt: Date;
}

/**
 * Фотоальбом на личной странице (VED-686, часть 3). Заливает, подписывает и
 * снимает сам автор; смотрит любой вошедший, кроме тех, кого зритель не
 * должен видеть. Фото едут через сервер и пережимаются в webp, как
 * картинки постов, — прямой заливки в бакет тут нет.
 */
@Injectable()
export class BlogAlbumService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly moderation: ModerationService,
    private readonly images: BlogImagesService,
  ) {}

  /**
   * Альбом автора, свежие сверху. Скрытый зрителю человек отвечает так же,
   * как несуществующий, — то же правило, что у файлов и ленты автора.
   */
  async forAuthor(
    viewerId: string,
    authorId: string,
  ): Promise<BlogAlbumResponse> {
    const hidden = await this.moderation.hiddenUserIds(viewerId, 'all');
    const author = await this.prisma.user.findUnique({
      where: { id: authorId },
      select: { id: true },
    });
    if (!author || (hidden.has(authorId) && authorId !== viewerId)) {
      throw new NotFoundException('author_not_found');
    }
    const photos = await this.prisma.blogAlbumPhoto.findMany({
      where: { userId: authorId },
      orderBy: { createdAt: 'desc' },
    });
    return { photos: photos.map((photo) => this.toDto(photo)) };
  }

  /**
   * Пачка фото. Один плохой файл не отменяет хороших: отказ получает он
   * один. Предел альбома считаем по ходу — фото сверх него получают
   * `album_full`, остальные ложатся.
   */
  async upload(
    userId: string,
    files: UploadedImageFile[],
  ): Promise<BlogAlbumUploadResponse> {
    if (files.length === 0) throw new BadRequestException('no_files');
    // Тот же код и статус, что у публикации поста с картинками.
    if (!this.images.configured) {
      throw new BadRequestException('image_upload_unavailable');
    }

    let count = await this.prisma.blogAlbumPhoto.count({ where: { userId } });
    const photos: BlogAlbumPhotoDto[] = [];
    const failed: BlogImageRejection[] = [];

    for (const file of files) {
      const name = file.originalname ?? 'файл';
      const denial = albumFileDenial(file, count);
      if (denial) {
        failed.push({ name, reason: denial });
        continue;
      }
      const stored = await this.images
        .storeAlbumPhoto(userId, file)
        .catch(() => null);
      // Тот же код, что у битой картинки поста.
      if (!stored) {
        failed.push({ name, reason: 'processing_failed' });
        continue;
      }
      const row = await this.prisma.blogAlbumPhoto.create({
        data: {
          userId,
          storageKey: stored.key,
          url: stored.url,
          width: stored.width,
          height: stored.height,
          sizeBytes: stored.sizeBytes,
        },
      });
      count += 1;
      photos.push(this.toDto(row));
    }

    return { photos, failed };
  }

  async updateCaption(
    userId: string,
    photoId: string,
    body: UpdateBlogAlbumPhotoRequest,
  ): Promise<BlogAlbumPhotoDto> {
    const photo = await this.own(userId, photoId);
    const caption = parseAlbumCaption(body);
    const updated = await this.prisma.blogAlbumPhoto.update({
      where: { id: photo.id },
      data: { caption },
    });
    return this.toDto(updated);
  }

  /** Снять можно только своё фото; чужое отвечает как несуществующее. */
  async remove(userId: string, photoId: string): Promise<void> {
    const photo = await this.own(userId, photoId);
    await this.prisma.blogAlbumPhoto.delete({ where: { id: photo.id } });
    await this.images.remove(photo.storageKey);
  }

  private async own(userId: string, photoId: string) {
    const photo = await this.prisma.blogAlbumPhoto.findUnique({
      where: { id: photoId },
    });
    if (!photo || photo.userId !== userId) {
      throw new NotFoundException('photo_not_found');
    }
    return photo;
  }

  private toDto(photo: PhotoRow): BlogAlbumPhotoDto {
    return {
      id: photo.id,
      url: photo.url,
      width: photo.width,
      height: photo.height,
      caption: photo.caption,
      createdAt: photo.createdAt.toISOString(),
    };
  }
}
