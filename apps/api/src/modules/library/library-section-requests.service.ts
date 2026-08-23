import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type {
  CreateLibrarySectionRequestBody,
  DecideLibrarySectionRequestBody,
  LibrarySectionRequestDto,
  LibrarySectionRequestsState,
  NotificationEvent,
} from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { LibrarySectionsService } from './library-sections.service';

const MAX_TITLE_LENGTH = 120;
const MAX_REASON_LENGTH = 1000;
/** Больше открытых заявок от одного человека — это уже поток, а не просьба. */
const MAX_OPEN_PER_USER = 5;

type RequestRow = {
  id: string;
  titleRu: string;
  titleEn: string;
  reason: string | null;
  status: 'pending' | 'approved' | 'rejected';
  decision: string | null;
  decidedAt: Date | null;
  createdAt: Date;
  requestedBy?: { name: string } | null;
};

function toDto(row: RequestRow): LibrarySectionRequestDto {
  return {
    id: row.id,
    titleRu: row.titleRu,
    titleEn: row.titleEn,
    reason: row.reason,
    status: row.status,
    // Мирское имя: заявку разбирает администрация, ей важно понимать, кто
    // перед ней, — то же правило, что в модерации.
    requestedByName: row.requestedBy?.name ?? null,
    decision: row.decision,
    decidedAt: row.decidedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

const REQUEST_SELECT = {
  id: true,
  titleRu: true,
  titleEn: true,
  reason: true,
  status: true,
  decision: true,
  decidedAt: true,
  createdAt: true,
  requestedBy: { select: { name: true } },
} as const;

/**
 * Заявки на новые разделы справочника.
 *
 * Разделы заводит только администрация — это заранее продуманный список
 * рубрик. Заявка даёт участнику выход, когда подходящего раздела нет:
 * иначе он либо кладёт материал не туда, либо не кладёт вовсе.
 */
@Injectable()
export class LibrarySectionRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sections: LibrarySectionsService,
    private readonly bus: EventEmitter2,
  ) {}

  async create(
    userId: string,
    body: CreateLibrarySectionRequestBody,
  ): Promise<LibrarySectionRequestDto> {
    const titleRu = body?.titleRu?.trim();
    const titleEn = body?.titleEn?.trim();
    if (!titleRu || !titleEn) {
      throw new BadRequestException('title_required');
    }
    if (titleRu.length > MAX_TITLE_LENGTH || titleEn.length > MAX_TITLE_LENGTH) {
      throw new BadRequestException('title_too_long');
    }

    const reason = body?.reason?.trim() || null;
    if (reason && reason.length > MAX_REASON_LENGTH) {
      throw new BadRequestException('reason_too_long');
    }

    const open = await this.prisma.librarySectionRequest.count({
      where: { requestedById: userId, status: 'pending' },
    });
    if (open >= MAX_OPEN_PER_USER) {
      throw new BadRequestException('too_many_open_requests');
    }

    const created = await this.prisma.librarySectionRequest.create({
      data: { requestedById: userId, titleRu, titleEn, reason },
      select: REQUEST_SELECT,
    });
    return toDto(created);
  }

  /** Свои заявки: без них человек не узнает, что стало с просьбой. */
  async listMine(userId: string): Promise<LibrarySectionRequestsState> {
    const rows = await this.prisma.librarySectionRequest.findMany({
      where: { requestedById: userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: REQUEST_SELECT,
    });
    return {
      requests: rows.map(toDto),
      pendingCount: rows.filter((row) => row.status === 'pending').length,
    };
  }

  async listForAdmin(
    viewerIsAdmin: boolean,
    status?: string,
  ): Promise<LibrarySectionRequestsState> {
    if (!viewerIsAdmin) throw new ForbiddenException('not_admin');

    const where = {
      status:
        status === 'approved' || status === 'rejected' ? status : 'pending',
    } as const;

    const [rows, pendingCount] = await Promise.all([
      this.prisma.librarySectionRequest.findMany({
        where,
        orderBy: { createdAt: 'asc' },
        take: 200,
        select: REQUEST_SELECT,
      }),
      this.prisma.librarySectionRequest.count({ where: { status: 'pending' } }),
    ]);

    return { requests: rows.map(toDto), pendingCount };
  }

  /**
   * Решение админа. `approve` заводит раздел тут же: заставлять переписывать
   * названия руками — верный способ получить раздел, не совпадающий с тем,
   * что одобрили.
   */
  async decide(
    adminId: string,
    viewerIsAdmin: boolean,
    id: string,
    body: DecideLibrarySectionRequestBody,
  ): Promise<LibrarySectionRequestDto> {
    if (!viewerIsAdmin) throw new ForbiddenException('not_admin');

    const existing = await this.prisma.librarySectionRequest.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        titleRu: true,
        titleEn: true,
        requestedById: true,
      },
    });
    if (!existing) throw new NotFoundException('request_not_found');
    if (existing.status !== 'pending') {
      throw new BadRequestException('request_already_decided');
    }

    const approved = body?.action === 'approve';
    const comment = body?.comment?.trim() || null;

    let createdSectionSlug: string | undefined;
    let createdSectionId: string | null = null;
    if (approved) {
      const section = await this.sections.create(true, {
        titleRu: existing.titleRu,
        titleEn: existing.titleEn,
      });
      createdSectionSlug = section.slug;
      createdSectionId = section.id;
    }

    const updated = await this.prisma.librarySectionRequest.update({
      where: { id },
      data: {
        status: approved ? 'approved' : 'rejected',
        decidedById: adminId,
        decidedAt: new Date(),
        decision: comment,
        createdSectionId,
      },
      select: REQUEST_SELECT,
    });

    // Через шину, а не прямым вызовом уведомлений: контракт сервисного
    // модуля запрещает Библиотеке импортировать чужой фичевый модуль.
    // Событие самодостаточно — подписчик ничего не дочитывает.
    const event: NotificationEvent = {
      name: 'library.section-request.decided',
      recipientId: existing.requestedById,
      requestId: existing.id,
      titleRu: existing.titleRu,
      approved,
      ...(createdSectionSlug ? { sectionSlug: createdSectionSlug } : {}),
      ...(comment ? { comment } : {}),
    };
    this.bus.emit(event.name, event);

    return toDto(updated);
  }
}
