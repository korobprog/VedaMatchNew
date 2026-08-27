import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Redirect,
  ServiceUnavailableException,
  UseGuards,
} from '@nestjs/common';
import type { AccessTokenPayload } from '@vedamatch/shared';
import { AuthGuard, CurrentUser } from '../auth/auth.guard';
import { PrismaService } from '../../prisma/prisma.service';
import { MusicStorageService } from './music-storage.service';
import { isAdmin } from './is-admin';

/**
 * Отдача аудио.
 *
 * Отдельным контроллером, а не рядом с каталогом, ровно из-за guard'а:
 * каталог открыт гостю, а звук — нет. Публичная витрина нужна, чтобы ссылку
 * на запись можно было переслать; выкачать по ней каталог — нельзя.
 *
 * Ответ — 302 на подписанную ссылку, а не поток через API. Так раздачей
 * занимается S3: диапазонные запросы, перемотка и докачка достаются
 * бесплатно, а процесс Nest не держит соединение на всё время
 * прослушивания.
 */
@Controller('music/tracks')
@UseGuards(AuthGuard)
export class MusicStreamController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: MusicStorageService,
  ) {}

  @Get(':id/stream')
  @Redirect()
  async stream(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
  ) {
    const track = await this.prisma.musicTrack.findUnique({
      where: { id },
      select: { storageKey: true, status: true, uploadedById: true },
    });

    const visible =
      track &&
      (track.status === 'published' ||
        isAdmin(user) ||
        track.uploadedById === user.sub);

    // 404 и на «нет записи», и на «не для вас»: иначе по коду ответа можно
    // перебрать, какие черновики существуют.
    if (!track || !visible) throw new NotFoundException('Запись не найдена');

    const url = await this.storage.presignGet(track.storageKey);
    if (!url) {
      throw new ServiceUnavailableException('Хранилище недоступно');
    }

    // 302, а не 301: ссылка живёт шесть часов, и закешировать её навсегда
    // означает отдать протухший адрес завтра.
    return { url, statusCode: 302 };
  }
}
