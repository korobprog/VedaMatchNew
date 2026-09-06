import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  AccessTokenPayload,
  MotivationAudioDto,
} from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { MotivationGenerationService } from './motivation-generation.service';
import { isAdmin } from './is-admin';
import {
  audioKey,
  audioMessage,
  titleFromFilename,
  validateAudio,
  type UploadedAudio,
} from './audio-upload';

/**
 * Фоновая музыка Вдохновения.
 *
 * Своя подборка, а не плейлист из сервиса Музыки: сервисы портала не ходят в
 * чужие таблицы, а фон и киртаны — разные вещи. Под киртан шлоку не почитаешь,
 * и держать их в одной очереди значит мешать обеим.
 *
 * Файлы едут туда же, куда кадры рилсов, — через `uploadStory`: второй
 * загрузчик в том же модуле разошёлся бы с первым по настройкам хранилища.
 */
@Injectable()
export class MotivationAudioService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly generation: MotivationGenerationService,
  ) {}

  /** Что играть читателю: только включённое, в заданном порядке. */
  async list(): Promise<{ items: MotivationAudioDto[] }> {
    const rows = await this.prisma.motivationAudio.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    return { items: rows.map((row) => this.toDto(row)) };
  }

  /** В админке видно и выключенное: его выключили, а не потеряли. */
  async adminList(
    user: AccessTokenPayload,
  ): Promise<{ items: MotivationAudioDto[] }> {
    this.requireAdmin(user);
    const rows = await this.prisma.motivationAudio.findMany({
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    return { items: rows.map((row) => this.toDto(row)) };
  }

  async adminUpload(
    user: AccessTokenPayload,
    file: UploadedAudio | undefined,
    title?: string,
  ): Promise<MotivationAudioDto> {
    this.requireAdmin(user);
    const problem = validateAudio(file);
    if (problem) throw new BadRequestException(audioMessage(problem));

    // Запись заводим до загрузки: её идентификатор идёт в ключ хранилища,
    // и по нему потом видно, какому ряду принадлежит файл.
    const row = await this.prisma.motivationAudio.create({
      data: {
        title: (title ?? '').trim() || titleFromFilename(file!.originalname),
        url: '',
        sortOrder: await this.nextSortOrder(),
      },
    });
    try {
      const url = await this.generation.uploadStory(
        audioKey(row.id, file!.mimetype, Date.now()),
        file!.buffer,
        file!.mimetype,
      );
      const saved = await this.prisma.motivationAudio.update({
        where: { id: row.id },
        data: { url },
      });
      return this.toDto(saved);
    } catch (error) {
      // Хранилище не ответило — строка без файла в списке бесполезна и
      // выглядит как исправная запись, которая молчит.
      await this.prisma.motivationAudio.delete({ where: { id: row.id } });
      throw error;
    }
  }

  async adminUpdate(
    user: AccessTokenPayload,
    id: string,
    patch: { title?: string; isActive?: boolean; sortOrder?: number },
  ): Promise<MotivationAudioDto> {
    this.requireAdmin(user);
    await this.require(id);
    const title = patch.title?.trim();
    const saved = await this.prisma.motivationAudio.update({
      where: { id },
      data: {
        ...(title ? { title } : {}),
        ...(patch.isActive === undefined ? {} : { isActive: patch.isActive }),
        ...(patch.sortOrder === undefined
          ? {}
          : { sortOrder: patch.sortOrder }),
      },
    });
    return this.toDto(saved);
  }

  async adminRemove(
    user: AccessTokenPayload,
    id: string,
  ): Promise<{ ok: true }> {
    this.requireAdmin(user);
    await this.require(id);
    // Сам файл в хранилище остаётся: его мог кто-то слушать в эту секунду, а
    // место под двадцать мегабайт дешевле оборванного воспроизведения.
    await this.prisma.motivationAudio.delete({ where: { id } });
    return { ok: true };
  }

  private async require(id: string) {
    const row = await this.prisma.motivationAudio.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!row) throw new NotFoundException('Запись не найдена');
    return row;
  }

  private requireAdmin(user: AccessTokenPayload) {
    if (!isAdmin(user)) throw new ForbiddenException('Только администратор');
  }

  /** Новая запись встаёт в конец: порядок задаёт админ, а не случай. */
  private async nextSortOrder(): Promise<number> {
    const last = await this.prisma.motivationAudio.findFirst({
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true },
    });
    return (last?.sortOrder ?? 0) + 1;
  }

  private toDto(row: {
    id: string;
    title: string;
    url: string;
    durationSeconds: number | null;
    isActive: boolean;
    sortOrder: number;
  }): MotivationAudioDto {
    return {
      id: row.id,
      title: row.title,
      url: row.url,
      durationSeconds: row.durationSeconds,
      isActive: row.isActive,
      sortOrder: row.sortOrder,
    };
  }
}
