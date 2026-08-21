import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  BROADCAST_BODY_MAX_LENGTH,
  BROADCAST_TITLE_MAX_LENGTH,
} from '@vedamatch/shared';
import type {
  CreateNotificationBroadcastRequest,
  NotificationAudienceFilter,
  NotificationAudiencePreviewResponse,
  NotificationBroadcastDto,
  UpdateNotificationBroadcastRequest,
} from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { buildAudienceWhere, normalizeAudience } from './broadcast-audience';

/** Поля, из которых собирается DTO. Автор нужен строкой, а не связью. */
const broadcastSelect = {
  id: true,
  title: true,
  body: true,
  url: true,
  important: true,
  audience: true,
  status: true,
  totalRecipients: true,
  deliveredCount: true,
  pushSentCount: true,
  errorMessage: true,
  createdAt: true,
  startedAt: true,
  finishedAt: true,
  createdBy: { select: { name: true } },
} satisfies Prisma.NotificationBroadcastSelect;

type BroadcastRow = Prisma.NotificationBroadcastGetPayload<{
  select: typeof broadcastSelect;
}>;

@Injectable()
export class NotificationBroadcastService {
  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<NotificationBroadcastDto[]> {
    const rows = await this.prisma.notificationBroadcast.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: broadcastSelect,
    });
    return rows.map(toDto);
  }

  async byId(id: string): Promise<NotificationBroadcastDto> {
    const row = await this.prisma.notificationBroadcast.findUnique({
      where: { id },
      select: broadcastSelect,
    });
    if (!row) throw new NotFoundException('Рассылка не найдена');
    return toDto(row);
  }

  async create(
    adminId: string,
    body: CreateNotificationBroadcastRequest,
  ): Promise<NotificationBroadcastDto> {
    const content = validateContent(body.title, body.body, body.url);
    const row = await this.prisma.notificationBroadcast.create({
      data: {
        ...content,
        important: body.important === true,
        audience: normalizeAudience(body.audience) as Prisma.InputJsonValue,
        createdById: adminId,
      },
      select: broadcastSelect,
    });
    return toDto(row);
  }

  /** Править можно только черновик: у отправленного текст уже у людей. */
  async update(
    id: string,
    body: UpdateNotificationBroadcastRequest,
  ): Promise<NotificationBroadcastDto> {
    const current = await this.ensureDraft(id);
    const content = validateContent(
      body.title ?? current.title,
      body.body ?? current.body,
      body.url === undefined ? current.url : body.url,
    );
    const row = await this.prisma.notificationBroadcast.update({
      where: { id },
      data: {
        ...content,
        important: body.important ?? current.important,
        audience: normalizeAudience(
          body.audience ?? (current.audience as NotificationAudienceFilter),
        ) as Prisma.InputJsonValue,
      },
      select: broadcastSelect,
    });
    return toDto(row);
  }

  async remove(id: string): Promise<void> {
    await this.ensureDraft(id);
    await this.prisma.notificationBroadcast.delete({ where: { id } });
  }

  /**
   * Запуск. Считает аудиторию здесь же, чтобы админ видел в списке число,
   * с которым рассылка стартовала, а не пересчитанное задним числом. Дальше
   * рассылку разбирает воркер: отправка пакетами не влезает в один запрос.
   */
  async start(id: string): Promise<NotificationBroadcastDto> {
    const current = await this.ensureDraft(id);
    const audience = normalizeAudience(
      current.audience as NotificationAudienceFilter,
    );
    const totalRecipients = await this.prisma.user.count({
      where: buildAudienceWhere(audience, new Date()),
    });
    if (totalRecipients === 0) {
      throw new BadRequestException('Под фильтр не попал ни один аккаунт');
    }

    // updateMany с проверкой статуса, а не update: два админа могут нажать
    // «Отправить» одновременно, и второй не должен запустить рассылку повторно.
    const claimed = await this.prisma.notificationBroadcast.updateMany({
      where: { id, status: 'draft' },
      data: {
        status: 'sending',
        totalRecipients,
        deliveredCount: 0,
        pushSentCount: 0,
        cursorUserId: null,
        errorMessage: null,
        startedAt: new Date(),
        finishedAt: null,
      },
    });
    if (claimed.count === 0) {
      throw new ConflictException('Рассылка уже запущена');
    }
    return this.byId(id);
  }

  /** Отмена на ходу: воркер увидит статус на следующем пакете и остановится. */
  async cancel(id: string): Promise<NotificationBroadcastDto> {
    const cancelled = await this.prisma.notificationBroadcast.updateMany({
      where: { id, status: { in: ['draft', 'sending'] } },
      data: { status: 'cancelled', finishedAt: new Date() },
    });
    if (cancelled.count === 0) {
      throw new ConflictException(
        'Отменить можно только черновик или отправку',
      );
    }
    return this.byId(id);
  }

  /**
   * Сколько человек получит рассылку. Три числа, а не одно: администратору
   * важно понимать, что выключившие категорию не увидят пуш, а при `important`
   * всё равно получат запись в колокольчике.
   */
  async preview(
    input: NotificationAudienceFilter | undefined,
  ): Promise<NotificationAudiencePreviewResponse> {
    const where = buildAudienceWhere(normalizeAudience(input), new Date());
    const [total, optedOut, withPush] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.count({
        where: {
          ...where,
          notificationPreference: {
            OR: [{ enabled: false }, { system: false }],
          },
        },
      }),
      this.prisma.user.count({
        where: {
          ...where,
          pushSubscriptions: { some: {} },
          OR: [
            { notificationPreference: null },
            { notificationPreference: { enabled: true, system: true } },
          ],
        },
      }),
    ]);
    return { total, withPush, optedOut };
  }

  private async ensureDraft(id: string) {
    const row = await this.prisma.notificationBroadcast.findUnique({
      where: { id },
    });
    if (!row) throw new NotFoundException('Рассылка не найдена');
    if (row.status !== 'draft') {
      throw new ConflictException('Менять можно только черновик');
    }
    return row;
  }
}

/**
 * Проверка текста. Пустой заголовок или тело — самая частая опечатка в форме,
 * а уведомление без текста уже не отозвать: оно у людей на экране.
 */
function validateContent(
  title: string | undefined,
  body: string | undefined,
  url: string | null | undefined,
): { title: string; body: string; url: string | null } {
  const cleanTitle = (title ?? '').trim();
  const cleanBody = (body ?? '').trim();
  if (!cleanTitle) throw new BadRequestException('Заголовок обязателен');
  if (!cleanBody) throw new BadRequestException('Текст обязателен');
  if (cleanTitle.length > BROADCAST_TITLE_MAX_LENGTH) {
    throw new BadRequestException(
      `Заголовок длиннее ${BROADCAST_TITLE_MAX_LENGTH} символов`,
    );
  }
  if (cleanBody.length > BROADCAST_BODY_MAX_LENGTH) {
    throw new BadRequestException(
      `Текст длиннее ${BROADCAST_BODY_MAX_LENGTH} символов`,
    );
  }

  const cleanUrl = (url ?? '').trim();
  if (cleanUrl && !cleanUrl.startsWith('/')) {
    // Только внутренние адреса: уведомление портала не уводит на чужой сайт.
    throw new BadRequestException('Ссылка должна начинаться с «/»');
  }
  return { title: cleanTitle, body: cleanBody, url: cleanUrl || null };
}

function toDto(row: BroadcastRow): NotificationBroadcastDto {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    url: row.url,
    important: row.important,
    audience: (row.audience ?? {}) as NotificationAudienceFilter,
    status: row.status,
    totalRecipients: row.totalRecipients,
    deliveredCount: row.deliveredCount,
    pushSentCount: row.pushSentCount,
    errorMessage: row.errorMessage,
    createdByName: row.createdBy?.name ?? null,
    createdAt: row.createdAt.toISOString(),
    startedAt: row.startedAt?.toISOString() ?? null,
    finishedAt: row.finishedAt?.toISOString() ?? null,
  };
}
