import { BadRequestException, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { Prisma } from '@prisma/client';
import type {
  AdminAuditEvent,
  AdminServiceCardDto,
  CreateAdminServiceRequest,
  UpdateAdminServiceRequest,
} from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { assertServiceSlug, normalizeServiceInput } from './service-input';

const cardSelect = {
  id: true,
  slug: true,
  name: true,
  nameEn: true,
  description: true,
  iconUrl: true,
  url: true,
  status: true,
  category: true,
  sortOrder: true,
  public: true,
  seekerVisible: true,
  practitionerVisible: true,
  yogiVisible: true,
  devoteeSelfIdentifiedVisible: true,
  devoteeVerifiedVisible: true,
  updatedAt: true,
  _count: { select: { access: true } },
} satisfies Prisma.ServiceSelect;

type CardRow = Prisma.ServiceGetPayload<{ select: typeof cardSelect }>;

/**
 * Каталог сервисов портала. Правит то, что видно в сетке после входа: имя,
 * описание, статус, порядок и видимость по этапам. Тексты лендинга сюда не
 * относятся — они в коде веба и меняются вместе с ним.
 */
@Injectable()
export class AdminCatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
  ) {}

  async list(): Promise<AdminServiceCardDto[]> {
    const rows = await this.prisma.service.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: cardSelect,
    });
    return rows.map(toDto);
  }

  async create(
    adminId: string,
    body: CreateAdminServiceRequest,
  ): Promise<AdminServiceCardDto> {
    const slug = assertServiceSlug(body?.slug);
    const existing = await this.prisma.service.findUnique({ where: { slug } });
    if (existing) throw new BadRequestException('Такой слаг уже занят');

    const data = normalizeServiceInput(body);
    if (!data.name || !data.description || !data.url || !data.category) {
      throw new BadRequestException(
        'Имя, описание, адрес и категория обязательны',
      );
    }

    const created = await this.prisma.service.create({
      data: {
        ...data,
        slug,
        name: data.name,
        description: data.description,
        url: data.url,
        category: data.category,
      },
      select: { id: true },
    });
    const row = await this.byId(created.id);
    this.audit(adminId, 'catalog.service-created', row.id, { title: row.name });
    return row;
  }

  async update(
    adminId: string,
    id: string,
    body: UpdateAdminServiceRequest,
  ): Promise<AdminServiceCardDto> {
    const data = normalizeServiceInput(body);
    if (Object.keys(data).length === 0) {
      throw new BadRequestException('Нечего обновлять');
    }

    await this.prisma.service.update({ where: { id }, data });
    const row = await this.byId(id);
    this.audit(adminId, 'catalog.service-updated', row.id, {
      title: row.name,
      status: row.status,
    });
    return row;
  }

  /** Карточка после записи. Отдельным чтением: у `create`/`update` Prisma не
   *  выводит `_count`, а число персональных доступов нужно на экране. */
  private async byId(id: string): Promise<AdminServiceCardDto> {
    const row = await this.prisma.service.findUniqueOrThrow({
      where: { id },
      select: cardSelect,
    });
    return toDto(row);
  }

  private audit(
    actorId: string,
    action: AdminAuditEvent['action'],
    serviceId: string,
    details: AdminAuditEvent['details'],
  ): void {
    const event: AdminAuditEvent = {
      actorId,
      action,
      targetType: 'platform',
      targetId: serviceId,
      details,
    };
    this.events.emit('admin.action', event);
  }
}

function toDto(row: CardRow): AdminServiceCardDto {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    nameEn: row.nameEn,
    description: row.description,
    iconUrl: row.iconUrl,
    url: row.url,
    status: row.status,
    category: row.category,
    sortOrder: row.sortOrder,
    public: row.public,
    seekerVisible: row.seekerVisible,
    practitionerVisible: row.practitionerVisible,
    yogiVisible: row.yogiVisible,
    devoteeSelfIdentifiedVisible: row.devoteeSelfIdentifiedVisible,
    devoteeVerifiedVisible: row.devoteeVerifiedVisible,
    personalAccessCount: row._count.access,
    updatedAt: row.updatedAt.toISOString(),
  };
}
