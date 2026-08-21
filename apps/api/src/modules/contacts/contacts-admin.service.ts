import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { Prisma } from '@prisma/client';
import { CONTACTS_HIDE_REASON_MIN_LENGTH } from '@vedamatch/shared';
import type {
  AdminAuditEvent,
  ContactsAdminHideRequest,
  ContactsAdminProfileDto,
  ContactsAdminProfileListResponse,
  ContactsAdminProfileQuery,
  ContactsAdminStats,
  ContactsAdminTagDto,
  CreateContactsTagRequest,
  ProfileLocation,
  UpdateContactsTagRequest,
} from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';
import {
  assertTagSlug,
  buildProfileWhere,
  normalizeTagInput,
} from './contacts-admin-input';

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

const profileSelect = {
  userId: true,
  headline: true,
  about: true,
  offers: true,
  status: true,
  visibility: true,
  ashram: true,
  updatedAt: true,
  user: {
    select: {
      name: true,
      email: true,
      homeLocation: true,
      lastSeenAt: true,
    },
  },
  tags: { select: { tag: { select: { nameRu: true } } } },
} satisfies Prisma.ContactsProfileSelect;

type ProfileRow = Prisma.ContactsProfileGetPayload<{
  select: typeof profileSelect;
}>;

/**
 * Администрирование справочника. Два рычага: справочник тегов, который до сих
 * пор менялся только сидом, и снятие карточки с публикации.
 */
@Injectable()
export class ContactsAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
  ) {}

  async stats(): Promise<ContactsAdminStats> {
    const [
      total,
      active,
      pending,
      hidden,
      tagsTotal,
      system,
      requests,
      accepted,
    ] = await Promise.all([
      this.prisma.contactsProfile.count(),
      this.prisma.contactsProfile.count({ where: { status: 'active' } }),
      this.prisma.contactsProfile.count({ where: { status: 'pending' } }),
      this.prisma.contactsProfile.count({ where: { visibility: 'hidden' } }),
      this.prisma.contactsTag.count(),
      this.prisma.contactsTag.count({ where: { isSystem: true } }),
      this.prisma.contactsRequest.count({ where: { status: 'pending' } }),
      this.prisma.contactsRequest.count({ where: { status: 'accepted' } }),
    ]);

    return {
      profiles: { total, active, pending, hidden },
      tags: { total: tagsTotal, system, custom: tagsTotal - system },
      requests: { pending: requests, accepted },
    };
  }

  // ===== Справочник тегов =====

  async listTags(): Promise<ContactsAdminTagDto[]> {
    const rows = await this.prisma.contactsTag.findMany({
      orderBy: [{ kind: 'asc' }, { sortOrder: 'asc' }, { nameRu: 'asc' }],
      select: {
        id: true,
        slug: true,
        kind: true,
        nameRu: true,
        isSystem: true,
        sortOrder: true,
        _count: { select: { profiles: true } },
      },
    });
    return rows.map((row) => ({
      id: row.id,
      slug: row.slug,
      kind: row.kind,
      nameRu: row.nameRu,
      isSystem: row.isSystem,
      sortOrder: row.sortOrder,
      profilesCount: row._count.profiles,
    }));
  }

  async createTag(
    adminId: string,
    body: CreateContactsTagRequest,
  ): Promise<ContactsAdminTagDto> {
    const slug = assertTagSlug(body?.slug);
    const existing = await this.prisma.contactsTag.findUnique({
      where: { slug },
    });
    if (existing) throw new BadRequestException('Такой слаг уже занят');

    const data = normalizeTagInput(body);
    if (!data.nameRu || !data.kind) {
      throw new BadRequestException('Название и вид обязательны');
    }

    // isSystem: false — тег заведён руками и его можно удалить. Системные
    // приезжают сидом, и удаление вернуло бы их при следующем запуске.
    const created = await this.prisma.contactsTag.create({
      data: {
        slug,
        nameRu: data.nameRu,
        kind: data.kind,
        sortOrder: data.sortOrder ?? 0,
        isSystem: false,
      },
      select: { id: true },
    });
    this.audit(adminId, 'contacts.tag-created', created.id, {
      title: data.nameRu,
      kind: data.kind,
    });
    return this.tagById(created.id);
  }

  async updateTag(
    adminId: string,
    id: string,
    body: UpdateContactsTagRequest,
  ): Promise<ContactsAdminTagDto> {
    const data = normalizeTagInput(body);
    if (Object.keys(data).length === 0) {
      throw new BadRequestException('Нечего обновлять');
    }
    const existing = await this.prisma.contactsTag.findUnique({
      where: { id },
    });
    if (!existing) throw new NotFoundException('Тег не найден');

    await this.prisma.contactsTag.update({ where: { id }, data });
    this.audit(adminId, 'contacts.tag-updated', id, {
      from: existing.nameRu,
      to: data.nameRu ?? existing.nameRu,
    });
    return this.tagById(id);
  }

  /**
   * Удаление тега. Только заведённый руками: системный вернётся ближайшим
   * сидом, и «удаление» оказалось бы враньём.
   */
  async deleteTag(adminId: string, id: string): Promise<void> {
    const existing = await this.prisma.contactsTag.findUnique({
      where: { id },
      select: { id: true, nameRu: true, isSystem: true },
    });
    if (!existing) throw new NotFoundException('Тег не найден');
    if (existing.isSystem) {
      throw new BadRequestException(
        'Системный тег удалить нельзя: он вернётся при следующем сиде',
      );
    }

    // Связи с карточками снимает каскад ContactsProfileTag.
    await this.prisma.contactsTag.delete({ where: { id } });
    this.audit(adminId, 'contacts.tag-deleted', id, { title: existing.nameRu });
  }

  // ===== Карточки =====

  async listProfiles(
    query: ContactsAdminProfileQuery,
  ): Promise<ContactsAdminProfileListResponse> {
    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = Math.min(
      MAX_PAGE_SIZE,
      Math.max(1, Number(query.pageSize) || DEFAULT_PAGE_SIZE),
    );
    const where = buildProfileWhere(query);

    const [rows, total] = await Promise.all([
      this.prisma.contactsProfile.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: profileSelect,
      }),
      this.prisma.contactsProfile.count({ where }),
    ]);

    return {
      items: await this.withCounters(rows),
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  /**
   * Снять карточку со справочника. Меняется `status`, а не `visibility`:
   * видимость выбирает сам человек, и перезаписать её значило бы стереть его
   * настройку. Выдача фильтрует по `status = active`, так что этого хватает.
   */
  async hideProfile(
    adminId: string,
    userId: string,
    body: ContactsAdminHideRequest,
  ): Promise<ContactsAdminProfileDto> {
    const reason = body?.reason?.trim() ?? '';
    if (reason.length < CONTACTS_HIDE_REASON_MIN_LENGTH) {
      throw new BadRequestException(
        `Укажите причину минимум ${CONTACTS_HIDE_REASON_MIN_LENGTH} символов`,
      );
    }
    await this.setStatus(userId, 'pending');
    this.audit(adminId, 'contacts.profile-hidden', userId, { reason });
    return this.profileByUserId(userId);
  }

  async restoreProfile(
    adminId: string,
    userId: string,
  ): Promise<ContactsAdminProfileDto> {
    await this.setStatus(userId, 'active');
    this.audit(adminId, 'contacts.profile-restored', userId);
    return this.profileByUserId(userId);
  }

  private async setStatus(
    userId: string,
    status: 'active' | 'pending',
  ): Promise<void> {
    const updated = await this.prisma.contactsProfile.updateMany({
      where: { userId },
      data: { status },
    });
    if (updated.count === 0) throw new NotFoundException('Карточка не найдена');
  }

  private async profileByUserId(
    userId: string,
  ): Promise<ContactsAdminProfileDto> {
    const row = await this.prisma.contactsProfile.findUniqueOrThrow({
      where: { userId },
      select: profileSelect,
    });
    const [dto] = await this.withCounters([row]);
    return dto;
  }

  private async tagById(id: string): Promise<ContactsAdminTagDto> {
    const tags = await this.listTags();
    const tag = tags.find((item) => item.id === id);
    if (!tag) throw new NotFoundException('Тег не найден');
    return tag;
  }

  /**
   * Счётчики, которых нет в карточке: жалобы и полученные обращения. Одним
   * запросом на страницу, а не по строке.
   */
  private async withCounters(
    rows: ProfileRow[],
  ): Promise<ContactsAdminProfileDto[]> {
    if (rows.length === 0) return [];
    const userIds = rows.map((row) => row.userId);
    const [reports, requests] = await Promise.all([
      this.prisma.userReport.groupBy({
        by: ['targetId'],
        where: { targetId: { in: userIds }, status: 'open' },
        _count: { _all: true },
      }),
      this.prisma.contactsRequest.groupBy({
        by: ['toUserId'],
        where: { toUserId: { in: userIds } },
        _count: { _all: true },
      }),
    ]);
    const reportsByUser = new Map(
      reports.map((row) => [row.targetId, row._count._all]),
    );
    const requestsByUser = new Map(
      requests.map((row) => [row.toUserId, row._count._all]),
    );

    return rows.map((row) => ({
      userId: row.userId,
      name: row.user.name,
      email: row.user.email,
      headline: row.headline,
      about: row.about,
      offers: row.offers,
      status: row.status,
      visibility: row.visibility,
      ashram: row.ashram,
      city: (row.user.homeLocation as ProfileLocation | null)?.city ?? null,
      tags: row.tags.map((link) => link.tag.nameRu),
      openReports: reportsByUser.get(row.userId) ?? 0,
      requestsReceived: requestsByUser.get(row.userId) ?? 0,
      lastSeenAt: row.user.lastSeenAt?.toISOString() ?? null,
      updatedAt: row.updatedAt.toISOString(),
    }));
  }

  private audit(
    actorId: string,
    action: AdminAuditEvent['action'],
    targetId: string,
    details?: AdminAuditEvent['details'],
  ): void {
    const event: AdminAuditEvent = {
      actorId,
      action,
      // Теги — общая настройка сервиса, карточка — конкретный человек.
      targetType: action.startsWith('contacts.tag') ? 'platform' : 'user',
      targetId,
      details,
    };
    this.events.emit('admin.action', event);
  }
}
