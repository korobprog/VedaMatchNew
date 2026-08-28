import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type {
  CreateMusicReportRequest,
  MusicAdminReportsDto,
  MusicReportDecisionRequest,
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

/** Сколько жалоб показываем за раз. Больше — это уже не разбор, а поток. */
const REPORTS_PAGE_SIZE = 50;

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

  // ---------- Разбор ----------

  /**
   * Открытые жалобы, старые сверху.
   *
   * Отдельно от очереди модерации, и это не дублирование: очередь показывает
   * `pending` — то, что ещё никто не слышал. Запись, скрытая по жалобам, в
   * `pending` не попадает никогда, и без этого списка она выпадала из поля
   * зрения навсегда: счётчик `openReports` в сводке был, а открыть его было
   * нечем.
   *
   * Имя жалобщика наружу не идёт: решают по записи и тексту, а не по тому,
   * кто пожаловался.
   */
  async list(viewerIsAdmin: boolean): Promise<MusicAdminReportsDto> {
    this.assertAdmin(viewerIsAdmin);

    const rows = await this.prisma.musicReport.findMany({
      where: { status: 'open' },
      orderBy: { createdAt: 'asc' },
      take: REPORTS_PAGE_SIZE,
      select: {
        id: true,
        kind: true,
        text: true,
        createdAt: true,
        track: {
          select: {
            id: true,
            title: true,
            status: true,
            artist: { select: { name: true } },
          },
        },
      },
    });

    // Сколько открытых жалоб на каждую запись — одним запросом, а не по
    // жалобе: на одну запись их обычно несколько, и N+1 здесь сам собой.
    const counts = await this.prisma.musicReport.groupBy({
      by: ['trackId'],
      where: {
        status: 'open',
        trackId: { in: rows.map((row) => row.track.id) },
      },
      _count: { id: true },
    });
    const openByTrack = new Map(
      counts.map((row) => [row.trackId, row._count.id]),
    );

    return {
      items: rows.map((row) => ({
        id: row.id,
        kind: row.kind,
        text: row.text,
        createdAt: row.createdAt.toISOString(),
        track: {
          id: row.track.id,
          title: row.track.title,
          status: row.track.status,
          artistName: row.track.artist?.name ?? null,
        },
        openOnTrack: openByTrack.get(row.track.id) ?? 1,
      })),
    };
  }

  /**
   * Решение по жалобе.
   *
   * Решение принимается по всем открытым жалобам на запись сразу: они об
   * одном и том же, и закрывать их поштучно значит скрывать запись заново на
   * каждой следующей.
   *
   * `rejected` возвращает запись в каталог — но только если она скрыта
   * именно по жалобам. Снятую администратором руками не трогаем: жалоба не
   * должна отменять чужое решение.
   */
  async decide(
    viewerIsAdmin: boolean,
    adminId: string,
    reportId: string,
    body: MusicReportDecisionRequest,
  ): Promise<{ ok: true }> {
    this.assertAdmin(viewerIsAdmin);

    const decision =
      body?.decision === 'rejected' ? 'rejected' : ('resolved' as const);

    const report = await this.prisma.musicReport.findUnique({
      where: { id: reportId },
      select: { id: true, status: true, trackId: true },
    });
    if (!report) throw new NotFoundException('Жалоба не найдена');
    if (report.status !== 'open') {
      throw new BadRequestException('По этой жалобе уже решили');
    }

    const track = await this.prisma.musicTrack.findUnique({
      where: { id: report.trackId },
      select: { id: true, status: true },
    });

    const now = new Date();
    const note = body?.note?.trim().slice(0, MAX_TEXT_LENGTH) || null;

    await this.prisma.$transaction([
      this.prisma.musicReport.updateMany({
        where: { trackId: report.trackId, status: 'open' },
        data: { status: decision, decidedAt: now, decidedById: adminId },
      }),
      ...(decision === 'rejected' && track?.status === 'hidden'
        ? [
            this.prisma.musicTrack.update({
              where: { id: report.trackId },
              data: { status: 'published', moderationNote: note },
            }),
          ]
        : note
          ? [
              this.prisma.musicTrack.update({
                where: { id: report.trackId },
                data: { moderationNote: note },
              }),
            ]
          : []),
    ]);

    return { ok: true };
  }

  private assertAdmin(viewerIsAdmin: boolean): void {
    if (!viewerIsAdmin) {
      throw new ForbiddenException('Доступ только для администратора сервиса');
    }
  }
}
