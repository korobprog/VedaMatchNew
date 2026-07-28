import { randomBytes } from 'node:crypto';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  AddSupportMessageRequest,
  AdminSupportTicketDto,
  AdminSupportTicketListItem,
  AdminSupportTicketListResponse,
  AdminUpdateSupportTicketRequest,
  CreateSupportTicketRequest,
  CreateSupportTicketResponse,
  Role,
  SupportTicketCategory,
  SupportTicketDto,
  SupportTicketListResponse,
  SupportTicketMessageDto,
  SupportTicketStatus,
} from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { toSubscriptionState } from '../billing/subscription';

const CATEGORIES: SupportTicketCategory[] = [
  'billing',
  'account',
  'technical',
  'moderation',
  'partnership',
  'other',
];
const STATUSES: SupportTicketStatus[] = [
  'open',
  'in_progress',
  'waiting_user',
  'resolved',
  'closed',
];
/** Статусы, которые ждут реакции поддержки. */
const ACTIVE_STATUSES: SupportTicketStatus[] = ['open', 'in_progress'];

const MAX_SUBJECT_LENGTH = 160;
const MAX_MESSAGE_LENGTH = 4000;
const MAX_CONTACT_LENGTH = 160;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const TELEGRAM_PATTERN = /^@?[A-Za-z0-9_]{4,32}$/;

const ticketInclude = {
  messages: { orderBy: { createdAt: 'asc' } },
  user: { select: { id: true, name: true, email: true } },
  assignedTo: { select: { id: true, name: true } },
} as const;

@Injectable()
export class SupportService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Создание обращения. Гость обязан оставить email или telegram, иначе ответить
   * будет некуда; у авторизованного контактом по умолчанию служит его email.
   */
  async create(
    body: CreateSupportTicketRequest,
    author?: { sub: string; email: string },
  ): Promise<CreateSupportTicketResponse> {
    const subject = requireText(
      body?.subject,
      MAX_SUBJECT_LENGTH,
      'тему обращения',
    );
    const message = requireText(
      body?.message,
      MAX_MESSAGE_LENGTH,
      'текст обращения',
    );
    const category = CATEGORIES.includes(
      body?.category as SupportTicketCategory,
    )
      ? (body.category as SupportTicketCategory)
      : 'other';

    const contactEmail =
      normalizeEmail(body?.contactEmail) ?? author?.email ?? null;
    const contactTelegram = normalizeTelegram(body?.contactTelegram);
    const contactName = optionalText(body?.contactName, MAX_CONTACT_LENGTH);

    if (!author && !contactEmail && !contactTelegram) {
      throw new BadRequestException(
        'Оставьте email или Telegram — иначе мы не сможем ответить',
      );
    }

    const ticket = await this.prisma.supportTicket.create({
      data: {
        trackToken: randomBytes(24).toString('base64url'),
        userId: author?.sub ?? null,
        subject,
        category,
        contactEmail,
        contactTelegram,
        contactName,
        messages: {
          create: {
            authorType: author ? 'user' : 'guest',
            authorUserId: author?.sub ?? null,
            body: message,
          },
        },
      },
      select: {
        number: true,
        trackToken: true,
        status: true,
        createdAt: true,
      },
    });

    return {
      number: ticket.number,
      trackToken: ticket.trackToken,
      status: ticket.status,
      createdAt: ticket.createdAt.toISOString(),
    };
  }

  /** Публичный просмотр по секретной ссылке — для гостей без аккаунта. */
  async byTrackToken(token: string): Promise<SupportTicketDto> {
    const ticket = await this.prisma.supportTicket.findUnique({
      where: { trackToken: token },
      include: ticketInclude,
    });
    if (!ticket) throw new NotFoundException('Обращение не найдено');
    return toTicketDto(ticket);
  }

  async addGuestMessage(
    token: string,
    body: AddSupportMessageRequest,
  ): Promise<SupportTicketDto> {
    const ticket = await this.prisma.supportTicket.findUnique({
      where: { trackToken: token },
      select: { id: true, status: true },
    });
    if (!ticket) throw new NotFoundException('Обращение не найдено');
    await this.appendMessage(ticket.id, ticket.status, {
      authorType: 'guest',
      body: requireText(body?.body, MAX_MESSAGE_LENGTH, 'сообщение'),
    });
    return this.byTrackToken(token);
  }

  async listMine(userId: string): Promise<SupportTicketListResponse> {
    const tickets = await this.prisma.supportTicket.findMany({
      where: { userId },
      include: { _count: { select: { messages: true } } },
      orderBy: { lastMessageAt: 'desc' },
      take: 100,
    });

    return {
      items: tickets.map((ticket) => ({
        id: ticket.id,
        number: ticket.number,
        subject: ticket.subject,
        category: ticket.category,
        status: ticket.status,
        createdAt: ticket.createdAt.toISOString(),
        lastMessageAt: ticket.lastMessageAt.toISOString(),
        firstResponseAt: ticket.firstResponseAt?.toISOString() ?? null,
        messageCount: ticket._count.messages,
      })),
      openCount: tickets.filter((ticket) =>
        ACTIVE_STATUSES.includes(ticket.status),
      ).length,
    };
  }

  async getMine(userId: string, ticketId: string): Promise<SupportTicketDto> {
    const ticket = await this.prisma.supportTicket.findUnique({
      where: { id: ticketId },
      include: ticketInclude,
    });
    if (!ticket || ticket.userId !== userId) {
      throw new NotFoundException('Обращение не найдено');
    }
    return toTicketDto(ticket);
  }

  async addUserMessage(
    userId: string,
    ticketId: string,
    body: AddSupportMessageRequest,
  ): Promise<SupportTicketDto> {
    const ticket = await this.prisma.supportTicket.findUnique({
      where: { id: ticketId },
      select: { id: true, userId: true, status: true },
    });
    if (!ticket || ticket.userId !== userId) {
      throw new NotFoundException('Обращение не найдено');
    }
    await this.appendMessage(ticket.id, ticket.status, {
      authorType: 'user',
      authorUserId: userId,
      body: requireText(body?.body, MAX_MESSAGE_LENGTH, 'сообщение'),
    });
    return this.getMine(userId, ticketId);
  }

  async adminList(
    role: Role,
    status?: string,
  ): Promise<AdminSupportTicketListResponse> {
    ensureAdmin(role);
    const filter = STATUSES.includes(status as SupportTicketStatus)
      ? (status as SupportTicketStatus)
      : undefined;
    const now = Date.now();

    const [tickets, openCount] = await Promise.all([
      this.prisma.supportTicket.findMany({
        where: filter ? { status: filter } : undefined,
        include: {
          _count: { select: { messages: true } },
          user: { select: { id: true, name: true, email: true } },
          assignedTo: { select: { id: true, name: true } },
        },
        orderBy: [{ status: 'asc' }, { lastMessageAt: 'desc' }],
        take: 200,
      }),
      this.prisma.supportTicket.count({
        where: { status: { in: ACTIVE_STATUSES } },
      }),
    ]);

    return {
      items: tickets.map((ticket): AdminSupportTicketListItem => ({
        id: ticket.id,
        number: ticket.number,
        subject: ticket.subject,
        category: ticket.category,
        status: ticket.status,
        createdAt: ticket.createdAt.toISOString(),
        lastMessageAt: ticket.lastMessageAt.toISOString(),
        firstResponseAt: ticket.firstResponseAt?.toISOString() ?? null,
        messageCount: ticket._count.messages,
        contactEmail: ticket.contactEmail,
        contactTelegram: ticket.contactTelegram,
        contactName: ticket.contactName,
        requester: ticket.user,
        assignedTo: ticket.assignedTo,
        waitingMinutes: ticket.firstResponseAt
          ? null
          : Math.floor((now - ticket.createdAt.getTime()) / 60_000),
      })),
      openCount,
    };
  }

  async adminGet(role: Role, ticketId: string): Promise<AdminSupportTicketDto> {
    ensureAdmin(role);
    const ticket = await this.prisma.supportTicket.findUnique({
      where: { id: ticketId },
      include: {
        messages: { orderBy: { createdAt: 'asc' } },
        assignedTo: { select: { id: true, name: true } },
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            createdAt: true,
            trialEndsAt: true,
            subscriptionPaidUntil: true,
            subscriptionNote: true,
          },
        },
      },
    });
    if (!ticket) throw new NotFoundException('Обращение не найдено');

    return {
      ...toTicketDto(ticket),
      contactName: ticket.contactName,
      adminNote: ticket.adminNote,
      requester: ticket.user
        ? {
            id: ticket.user.id,
            name: ticket.user.name,
            email: ticket.user.email,
            subscription: toSubscriptionState(ticket.user),
          }
        : null,
      assignedTo: ticket.assignedTo,
      internalMessages: ticket.messages
        .filter((message) => message.isInternal)
        .map(toMessageDto),
    };
  }

  async adminUpdate(
    admin: { sub: string; role: Role },
    ticketId: string,
    body: AdminUpdateSupportTicketRequest,
  ): Promise<AdminSupportTicketDto> {
    ensureAdmin(admin.role);
    const ticket = await this.prisma.supportTicket.findUnique({
      where: { id: ticketId },
      select: { id: true, closedAt: true },
    });
    if (!ticket) throw new NotFoundException('Обращение не найдено');

    const data: {
      status?: SupportTicketStatus;
      category?: SupportTicketCategory;
      adminNote?: string | null;
      assignedToId?: string | null;
      closedAt?: Date | null;
    } = {};

    if (body?.status !== undefined) {
      if (!STATUSES.includes(body.status)) {
        throw new BadRequestException('Недопустимый статус обращения');
      }
      data.status = body.status;
      const finished = body.status === 'resolved' || body.status === 'closed';
      data.closedAt = finished ? (ticket.closedAt ?? new Date()) : null;
    }
    if (body?.category !== undefined) {
      if (!CATEGORIES.includes(body.category)) {
        throw new BadRequestException('Недопустимая категория обращения');
      }
      data.category = body.category;
    }
    if (body && 'adminNote' in body) {
      data.adminNote = optionalText(body.adminNote, MAX_MESSAGE_LENGTH);
    }
    if (body?.assignToMe !== undefined) {
      data.assignedToId = body.assignToMe ? admin.sub : null;
    }

    if (Object.keys(data).length === 0) {
      throw new BadRequestException('Нечего обновлять');
    }

    await this.prisma.supportTicket.update({ where: { id: ticketId }, data });
    return this.adminGet(admin.role, ticketId);
  }

  async adminReply(
    admin: { sub: string; role: Role },
    ticketId: string,
    body: AddSupportMessageRequest,
  ): Promise<AdminSupportTicketDto> {
    ensureAdmin(admin.role);
    const ticket = await this.prisma.supportTicket.findUnique({
      where: { id: ticketId },
      select: { id: true, status: true },
    });
    if (!ticket) throw new NotFoundException('Обращение не найдено');

    await this.appendMessage(ticket.id, ticket.status, {
      authorType: 'admin',
      authorUserId: admin.sub,
      body: requireText(body?.body, MAX_MESSAGE_LENGTH, 'ответ'),
      isInternal: body?.isInternal === true,
    });
    return this.adminGet(admin.role, ticketId);
  }

  /**
   * Добавляет сообщение и двигает статус: ответ поддержки переводит тикет в
   * «ждём пользователя», сообщение пользователя возвращает его в работу.
   * Внутренние заметки статус не трогают.
   */
  private async appendMessage(
    ticketId: string,
    currentStatus: SupportTicketStatus,
    message: {
      authorType: 'user' | 'guest' | 'admin';
      authorUserId?: string;
      body: string;
      isInternal?: boolean;
    },
  ): Promise<void> {
    const now = new Date();
    const isInternal = message.isInternal === true;
    const isAdmin = message.authorType === 'admin';

    const ticketData: {
      lastMessageAt?: Date;
      status?: SupportTicketStatus;
      closedAt?: null;
    } = {};

    if (!isInternal) {
      ticketData.lastMessageAt = now;
      if (isAdmin) {
        if (currentStatus !== 'closed' && currentStatus !== 'resolved') {
          ticketData.status = 'waiting_user';
        }
      } else if (currentStatus !== 'closed') {
        ticketData.status = 'in_progress';
        ticketData.closedAt = null;
      }
    }

    const writes = [
      this.prisma.supportTicketMessage.create({
        data: {
          ticketId,
          authorType: message.authorType,
          authorUserId: message.authorUserId ?? null,
          body: message.body,
          isInternal,
        },
      }),
      this.prisma.supportTicket.update({
        where: { id: ticketId },
        data: ticketData,
        select: { id: true },
      }),
    ];

    // firstResponseAt фиксирует именно первый ответ поддержки, поэтому пишется
    // только при пустом значении.
    if (isAdmin && !isInternal) {
      writes.push(
        this.prisma.supportTicket.updateMany({
          where: { id: ticketId, firstResponseAt: null },
          data: { firstResponseAt: now },
        }) as unknown as (typeof writes)[number],
      );
    }

    await this.prisma.$transaction(writes);
  }
}

interface TicketWithMessages {
  id: string;
  number: number;
  subject: string;
  category: SupportTicketCategory;
  status: SupportTicketStatus;
  createdAt: Date;
  updatedAt: Date;
  lastMessageAt: Date;
  firstResponseAt: Date | null;
  closedAt: Date | null;
  contactEmail: string | null;
  contactTelegram: string | null;
  messages: Array<{
    id: string;
    authorType: 'user' | 'guest' | 'admin';
    body: string;
    isInternal: boolean;
    createdAt: Date;
  }>;
}

function toTicketDto(ticket: TicketWithMessages): SupportTicketDto {
  return {
    id: ticket.id,
    number: ticket.number,
    subject: ticket.subject,
    category: ticket.category,
    status: ticket.status,
    createdAt: ticket.createdAt.toISOString(),
    updatedAt: ticket.updatedAt.toISOString(),
    lastMessageAt: ticket.lastMessageAt.toISOString(),
    firstResponseAt: ticket.firstResponseAt?.toISOString() ?? null,
    closedAt: ticket.closedAt?.toISOString() ?? null,
    contactEmail: ticket.contactEmail,
    contactTelegram: ticket.contactTelegram,
    // Внутренние заметки не покидают админку.
    messages: ticket.messages
      .filter((message) => !message.isInternal)
      .map(toMessageDto),
  };
}

function toMessageDto(message: {
  id: string;
  authorType: 'user' | 'guest' | 'admin';
  body: string;
  createdAt: Date;
}): SupportTicketMessageDto {
  return {
    id: message.id,
    authorType: message.authorType,
    authorName: message.authorType === 'admin' ? 'Поддержка VedaMatch' : null,
    body: message.body,
    createdAt: message.createdAt.toISOString(),
  };
}

function ensureAdmin(role: Role): void {
  if (role !== 'admin') {
    throw new ForbiddenException('Доступ только для администратора');
  }
}

function requireText(value: unknown, maxLength: number, label: string): string {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) throw new BadRequestException(`Заполните ${label}`);
  if (text.length > maxLength) {
    throw new BadRequestException(
      `Слишком длинный текст: максимум ${maxLength} символов`,
    );
  }
  return text;
}

function optionalText(value: unknown, maxLength: number): string | null {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) return null;
  if (text.length > maxLength) {
    throw new BadRequestException(
      `Слишком длинный текст: максимум ${maxLength} символов`,
    );
  }
  return text;
}

function normalizeEmail(value: unknown): string | null {
  const email = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!email) return null;
  if (email.length > MAX_CONTACT_LENGTH || !EMAIL_PATTERN.test(email)) {
    throw new BadRequestException('Некорректный email');
  }
  return email;
}

function normalizeTelegram(value: unknown): string | null {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw) return null;
  const handle = raw.replace(/^https?:\/\/t\.me\//i, '').replace(/^@/, '');
  if (!TELEGRAM_PATTERN.test(handle)) {
    throw new BadRequestException(
      'Telegram указывается как @username (4–32 символа)',
    );
  }
  return `@${handle}`;
}
