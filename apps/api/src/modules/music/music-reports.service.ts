import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type {
  CreateMusicReportRequest,
  MusicReportKind,
} from '@vedamatch/shared';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../prisma/prisma.service';
import {
  MUSIC_REVIEW_EXPIRED_NOTE,
  crossesHideThreshold,
  isReviewOverdue,
} from './music-publish-policy';

const MAX_TEXT_LENGTH = 1000;

/**
 * Жалобы на записи — первый рубеж модерации.
 *
 * Каталог наполняют люди, и слушают его тоже люди: заметят чужой концерт
 * или битый файл они раньше, чем единственный администратор дойдёт до
 * очереди. Порог превращает жалобы в действие, администратор разбирает уже
 * скрытое.
 *
 * Скрытие обратимо всегда. Удаления по жалобам нет и не будет: три аккаунта
 * не должны становиться кнопкой «удалить чужое».
 */
@Injectable()
export class MusicReportsService {
  private readonly logger = new Logger(MusicReportsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
  ) {}

  /**
   * Пожаловаться. Один человек жалуется на запись один раз: повторная
   * жалоба не добавляет веса, иначе порог обходится в одиночку.
   */
  async create(userId: string, body: CreateMusicReportRequest) {
    const track = await this.prisma.musicTrack.findUnique({
      where: { id: body.trackId },
      select: { id: true, status: true, title: true, uploadedById: true },
    });
    if (!track) throw new NotFoundException('Запись не найдена');

    const text = body.text?.trim().slice(0, MAX_TEXT_LENGTH) ?? '';
    if (!text) throw new BadRequestException('Опишите, что не так с записью');

    const already = await this.prisma.musicReport.findFirst({
      where: { trackId: track.id, reporterId: userId },
      select: { id: true },
    });
    if (already) {
      return { accepted: true as const, alreadyReported: true as const };
    }

    await this.prisma.musicReport.create({
      data: {
        trackId: track.id,
        reporterId: userId,
        kind: body.kind,
        text,
      },
    });

    const hidden = await this.hideIfThresholdCrossed(track.id, body.kind);
    // Автор узнаёт о скрытии сразу: без этого запись «пропадает сама».
    // Загрузивший мог быть удалён (uploadedById — SetNull) — тогда некому.
    if (hidden && track.uploadedById) {
      this.events.emit('music.track.hidden-by-reports', {
        // `name` в самой нагрузке, а не только в имени события: подписчик
        // получает один аргумент и по нему выбирает формулировку.
        name: 'music.track.hidden-by-reports',
        recipientId: track.uploadedById,
        trackId: track.id,
        title: track.title,
        kind: body.kind,
      });
    }
    return { accepted: true as const, alreadyReported: false as const, hidden };
  }

  /**
   * Скрыть, если жалоба пересекла порог именно сейчас.
   *
   * Считаем открытые жалобы того же вида: копирайт и «плохое качество» —
   * разные разговоры, и складывать их в одну кучу значит скрывать запись за
   * три претензии о битрейте.
   */
  private async hideIfThresholdCrossed(
    trackId: string,
    kind: MusicReportKind,
  ): Promise<boolean> {
    const open = await this.prisma.musicReport.count({
      where: { trackId, kind, status: 'open' },
    });
    if (!crossesHideThreshold(open, kind)) return false;

    // Скрываем только опубликованное: у неопубликованного и так нет витрины,
    // а перевод его в `hidden` сбил бы автору статус.
    const { count } = await this.prisma.musicTrack.updateMany({
      where: { id: trackId, status: 'published' },
      data: { status: 'hidden' },
    });
    if (count > 0) {
      this.logger.log(
        `Запись ${trackId} скрыта по жалобам (${kind}), ждёт решения редакции`,
      );
    }
    return count > 0;
  }

  /**
   * Срок вышел, а решения нет.
   *
   * Запись не удаляется: остаётся скрытой и возвращается автору с честной
   * причиной. Файл при этом занимает его квоту — это естественный стимул
   * убрать самому, и решение остаётся за ним, а не за молчанием редакции.
   *
   * Жалобы закрываются: автоматическое решение — тоже решение, и держать их
   * открытыми значит скрывать запись повторно на каждой следующей.
   */
  async closeOverdue(now: Date = new Date()): Promise<number> {
    const stale = await this.prisma.musicTrack.findMany({
      where: {
        status: 'hidden',
        reports: { some: { status: 'open' } },
      },
      select: {
        id: true,
        title: true,
        uploadedById: true,
        reports: {
          where: { status: 'open' },
          orderBy: { createdAt: 'asc' },
          take: 1,
          select: { createdAt: true },
        },
      },
      take: 100,
    });

    let closed = 0;
    for (const track of stale) {
      const escalatedAt = track.reports[0]?.createdAt;
      if (!escalatedAt || !isReviewOverdue(escalatedAt, now)) continue;

      await this.prisma.$transaction([
        this.prisma.musicReport.updateMany({
          where: { trackId: track.id, status: 'open' },
          data: { status: 'resolved', decidedAt: now },
        }),
        this.prisma.musicTrack.update({
          where: { id: track.id },
          data: { moderationNote: MUSIC_REVIEW_EXPIRED_NOTE },
        }),
      ]);
      if (track.uploadedById) {
        this.events.emit('music.track.review-expired', {
          name: 'music.track.review-expired',
          recipientId: track.uploadedById,
          trackId: track.id,
          title: track.title,
        });
      }
      closed += 1;
    }

    if (closed > 0) {
      this.logger.log(`Возвращено авторам без разбора за неделю: ${closed}`);
    }
    return closed;
  }
}
