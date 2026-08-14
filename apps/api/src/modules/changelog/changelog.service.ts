import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  AdminAnnouncementDto,
  AdminReleaseDto,
  AdminRoadmapItemDto,
  AnnouncementStatus,
  CreateAnnouncementRequest,
  CreateReleaseRequest,
  CreateRoadmapItemRequest,
  PublicAnnouncementDto,
  PublicReleaseDto,
  PublicRoadmapItemDto,
  Role,
  RoadmapStatus,
  UpdateAnnouncementRequest,
  UpdateReleaseRequest,
  UpdateRoadmapItemRequest,
} from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';

export type Lang = 'ru' | 'en';

const ANNOUNCEMENT_STATUSES: AnnouncementStatus[] = ['draft', 'published'];
const ROADMAP_STATUSES: RoadmapStatus[] = ['planned', 'in_progress', 'done'];

@Injectable()
export class ChangelogService {
  constructor(private readonly prisma: PrismaService) {}

  // ===== Публичное чтение =====

  async listReleases(lang: Lang): Promise<PublicReleaseDto[]> {
    const releases = await this.prisma.release.findMany({
      include: { changes: { orderBy: { sortOrder: 'asc' } } },
      orderBy: { releasedAt: 'desc' },
    });
    return releases.map((release) => this.toPublicRelease(release, lang));
  }

  async getCurrentRelease(lang: Lang): Promise<PublicReleaseDto | null> {
    const release = await this.prisma.release.findFirst({
      where: { isCurrent: true },
      include: { changes: { orderBy: { sortOrder: 'asc' } } },
    });
    return release ? this.toPublicRelease(release, lang) : null;
  }

  async listAnnouncements(lang: Lang): Promise<PublicAnnouncementDto[]> {
    const announcements = await this.prisma.announcement.findMany({
      where: { status: 'published' },
      orderBy: { publishedAt: 'desc' },
    });
    return announcements.map((item) => ({
      id: item.id,
      title: lang === 'en' ? item.titleEn : item.titleRu,
      body: lang === 'en' ? item.bodyEn : item.bodyRu,
      publishedAt: (item.publishedAt ?? item.createdAt).toISOString(),
    }));
  }

  async listRoadmap(lang: Lang): Promise<PublicRoadmapItemDto[]> {
    const items = await this.prisma.roadmapItem.findMany({
      orderBy: { sortOrder: 'asc' },
    });
    return items.map((item) => ({
      id: item.id,
      title: lang === 'en' ? item.titleEn : item.titleRu,
      description:
        (lang === 'en' ? item.descriptionEn : item.descriptionRu) ?? null,
      status: item.status,
      sortOrder: item.sortOrder,
    }));
  }

  // ===== Admin: релизы =====

  async adminListReleases(role: Role): Promise<AdminReleaseDto[]> {
    this.ensureAdmin(role);
    const releases = await this.prisma.release.findMany({
      include: { changes: { orderBy: { sortOrder: 'asc' } } },
      orderBy: { releasedAt: 'desc' },
    });
    return releases.map((release) => this.toAdminRelease(release));
  }

  async adminCreateRelease(
    role: Role,
    body: CreateReleaseRequest,
  ): Promise<AdminReleaseDto> {
    this.ensureAdmin(role);
    const release = await this.prisma.release.create({
      data: {
        version: body.version,
        releasedAt: new Date(body.releasedAt),
        changes: {
          create: (body.changes ?? []).map((change, index) => ({
            type: change.type,
            titleRu: change.titleRu,
            titleEn: change.titleEn,
            sortOrder: change.sortOrder ?? index,
          })),
        },
      },
      include: { changes: { orderBy: { sortOrder: 'asc' } } },
    });
    return this.toAdminRelease(release);
  }

  async adminUpdateRelease(
    role: Role,
    id: string,
    body: UpdateReleaseRequest,
  ): Promise<AdminReleaseDto> {
    this.ensureAdmin(role);
    await this.requireRelease(id);

    const release = await this.prisma.$transaction(async (tx) => {
      if (body.changes) {
        await tx.releaseChange.deleteMany({ where: { releaseId: id } });
      }
      return tx.release.update({
        where: { id },
        data: {
          version: body.version,
          releasedAt: body.releasedAt ? new Date(body.releasedAt) : undefined,
          changes: body.changes
            ? {
                create: body.changes.map((change, index) => ({
                  type: change.type,
                  titleRu: change.titleRu,
                  titleEn: change.titleEn,
                  sortOrder: change.sortOrder ?? index,
                })),
              }
            : undefined,
        },
        include: { changes: { orderBy: { sortOrder: 'asc' } } },
      });
    });
    return this.toAdminRelease(release);
  }

  /** Снимает `isCurrent` с прежней записи и ставит на новую в одной транзакции. */
  async adminSetCurrentRelease(role: Role, id: string): Promise<{ ok: true }> {
    this.ensureAdmin(role);
    await this.requireRelease(id);
    await this.prisma.$transaction([
      this.prisma.release.updateMany({
        where: { isCurrent: true },
        data: { isCurrent: false },
      }),
      this.prisma.release.update({
        where: { id },
        data: { isCurrent: true },
      }),
    ]);
    return { ok: true };
  }

  async adminDeleteRelease(role: Role, id: string): Promise<{ ok: true }> {
    this.ensureAdmin(role);
    await this.requireRelease(id);
    await this.prisma.release.delete({ where: { id } });
    return { ok: true };
  }

  // ===== Admin: новости =====

  async adminListAnnouncements(role: Role): Promise<AdminAnnouncementDto[]> {
    this.ensureAdmin(role);
    const items = await this.prisma.announcement.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return items.map((item) => this.toAdminAnnouncement(item));
  }

  async adminCreateAnnouncement(
    role: Role,
    body: CreateAnnouncementRequest,
  ): Promise<AdminAnnouncementDto> {
    this.ensureAdmin(role);
    const status = this.normalizeAnnouncementStatus(body.status);
    const item = await this.prisma.announcement.create({
      data: {
        titleRu: body.titleRu,
        titleEn: body.titleEn,
        bodyRu: body.bodyRu,
        bodyEn: body.bodyEn,
        status,
        publishedAt: status === 'published' ? new Date() : null,
      },
    });
    return this.toAdminAnnouncement(item);
  }

  async adminUpdateAnnouncement(
    role: Role,
    id: string,
    body: UpdateAnnouncementRequest,
  ): Promise<AdminAnnouncementDto> {
    this.ensureAdmin(role);
    const existing = await this.prisma.announcement.findUnique({
      where: { id },
    });
    if (!existing) throw new NotFoundException('Новость не найдена');

    const status = body.status
      ? this.normalizeAnnouncementStatus(body.status)
      : undefined;
    const becamePublished =
      status === 'published' && existing.status !== 'published';

    const item = await this.prisma.announcement.update({
      where: { id },
      data: {
        titleRu: body.titleRu,
        titleEn: body.titleEn,
        bodyRu: body.bodyRu,
        bodyEn: body.bodyEn,
        status,
        publishedAt: becamePublished ? new Date() : undefined,
      },
    });
    return this.toAdminAnnouncement(item);
  }

  async adminDeleteAnnouncement(role: Role, id: string): Promise<{ ok: true }> {
    this.ensureAdmin(role);
    const existing = await this.prisma.announcement.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('Новость не найдена');
    await this.prisma.announcement.delete({ where: { id } });
    return { ok: true };
  }

  // ===== Admin: roadmap =====

  async adminListRoadmap(role: Role): Promise<AdminRoadmapItemDto[]> {
    this.ensureAdmin(role);
    const items = await this.prisma.roadmapItem.findMany({
      orderBy: { sortOrder: 'asc' },
    });
    return items.map((item) => this.toAdminRoadmapItem(item));
  }

  async adminCreateRoadmapItem(
    role: Role,
    body: CreateRoadmapItemRequest,
  ): Promise<AdminRoadmapItemDto> {
    this.ensureAdmin(role);
    const item = await this.prisma.roadmapItem.create({
      data: {
        titleRu: body.titleRu,
        titleEn: body.titleEn,
        descriptionRu: body.descriptionRu ?? null,
        descriptionEn: body.descriptionEn ?? null,
        status: this.normalizeRoadmapStatus(body.status),
        sortOrder: body.sortOrder ?? 0,
      },
    });
    return this.toAdminRoadmapItem(item);
  }

  async adminUpdateRoadmapItem(
    role: Role,
    id: string,
    body: UpdateRoadmapItemRequest,
  ): Promise<AdminRoadmapItemDto> {
    this.ensureAdmin(role);
    const existing = await this.prisma.roadmapItem.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('Пункт roadmap не найден');

    const item = await this.prisma.roadmapItem.update({
      where: { id },
      data: {
        titleRu: body.titleRu,
        titleEn: body.titleEn,
        descriptionRu: body.descriptionRu,
        descriptionEn: body.descriptionEn,
        status: body.status
          ? this.normalizeRoadmapStatus(body.status)
          : undefined,
        sortOrder: body.sortOrder,
      },
    });
    return this.toAdminRoadmapItem(item);
  }

  async adminDeleteRoadmapItem(role: Role, id: string): Promise<{ ok: true }> {
    this.ensureAdmin(role);
    const existing = await this.prisma.roadmapItem.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('Пункт roadmap не найден');
    await this.prisma.roadmapItem.delete({ where: { id } });
    return { ok: true };
  }

  // ===== Приватные помощники =====

  private toPublicRelease(
    release: {
      id: string;
      version: string;
      isCurrent: boolean;
      releasedAt: Date;
      changes: Array<{
        id: string;
        type: 'feature' | 'fix' | 'improvement';
        titleRu: string;
        titleEn: string;
        sortOrder: number;
      }>;
    },
    lang: Lang,
  ): PublicReleaseDto {
    return {
      id: release.id,
      version: release.version,
      isCurrent: release.isCurrent,
      releasedAt: release.releasedAt.toISOString(),
      changes: release.changes.map((change) => ({
        id: change.id,
        type: change.type,
        title: lang === 'en' ? change.titleEn : change.titleRu,
        sortOrder: change.sortOrder,
      })),
    };
  }

  private toAdminRelease(release: {
    id: string;
    version: string;
    isCurrent: boolean;
    releasedAt: Date;
    changes: Array<{
      id: string;
      type: 'feature' | 'fix' | 'improvement';
      titleRu: string;
      titleEn: string;
      sortOrder: number;
    }>;
  }): AdminReleaseDto {
    return {
      id: release.id,
      version: release.version,
      isCurrent: release.isCurrent,
      releasedAt: release.releasedAt.toISOString(),
      changes: release.changes,
    };
  }

  private toAdminAnnouncement(item: {
    id: string;
    titleRu: string;
    titleEn: string;
    bodyRu: string;
    bodyEn: string;
    status: AnnouncementStatus;
    publishedAt: Date | null;
  }): AdminAnnouncementDto {
    return {
      id: item.id,
      titleRu: item.titleRu,
      titleEn: item.titleEn,
      bodyRu: item.bodyRu,
      bodyEn: item.bodyEn,
      status: item.status,
      publishedAt: item.publishedAt?.toISOString() ?? null,
    };
  }

  private toAdminRoadmapItem(item: {
    id: string;
    titleRu: string;
    titleEn: string;
    descriptionRu: string | null;
    descriptionEn: string | null;
    status: RoadmapStatus;
    sortOrder: number;
  }): AdminRoadmapItemDto {
    return item;
  }

  private normalizeAnnouncementStatus(
    status: AnnouncementStatus | undefined,
  ): AnnouncementStatus {
    return status && ANNOUNCEMENT_STATUSES.includes(status) ? status : 'draft';
  }

  private normalizeRoadmapStatus(
    status: RoadmapStatus | undefined,
  ): RoadmapStatus {
    return status && ROADMAP_STATUSES.includes(status) ? status : 'planned';
  }

  private async requireRelease(id: string): Promise<void> {
    const release = await this.prisma.release.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!release) throw new NotFoundException('Релиз не найден');
  }

  private ensureAdmin(role: Role): void {
    if (role !== 'admin') {
      throw new ForbiddenException('Доступ только для администратора');
    }
  }
}
