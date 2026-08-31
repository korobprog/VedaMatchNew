import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { NotificationEvent } from '@vedamatch/shared';
import type {
  AdminTeamApplicationListResponse,
  AdminUpdateTeamApplicationRequest,
  CreateTeamApplicationRequest,
  CreateTeamApplicationResponse,
  Role,
  TeamApplicationDto,
  TeamApplicationRole,
  TeamApplicationStatus,
} from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';

const ROLES: TeamApplicationRole[] = [
  'security',
  'backend',
  'frontend',
  'devops',
  'qa',
  'design',
  'community',
  'mobile',
  'other',
];
const STATUSES: TeamApplicationStatus[] = [
  'submitted',
  'reviewing',
  'accepted',
  'rejected',
  'closed',
];
const ROLE_LABELS: Record<TeamApplicationRole, string> = {
  security: 'Специалист по безопасности',
  backend: 'Backend-разработчик',
  frontend: 'Frontend-разработчик',
  devops: 'DevOps/SRE',
  qa: 'QA / test automation',
  design: 'UI/UX-дизайнер',
  community: 'Community/контент-менеджер',
  mobile: 'Mobile/PWA-оптимизация',
  other: 'Другое',
};

const MAX_MESSAGE_LENGTH = 4000;
const MAX_CONTACT_LENGTH = 160;
const MAX_ROLE_OTHER_LENGTH = 160;
const MAX_URL_LENGTH = 300;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const TELEGRAM_PATTERN = /^@?[A-Za-z0-9_]{4,32}$/;

@Injectable()
export class TeamApplicationsService {
  private readonly logger = new Logger(TeamApplicationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
  ) {}

  /**
   * Создание заявки. Кандидат всегда гость: контакт (email или telegram)
   * обязателен независимо от того, залогинен ли он случайно — решение по
   * заявке сообщается вне портала.
   */
  async create(
    body: CreateTeamApplicationRequest,
    author?: { sub: string },
  ): Promise<CreateTeamApplicationResponse> {
    const role = ROLES.includes(body?.role as TeamApplicationRole)
      ? (body.role as TeamApplicationRole)
      : null;
    if (!role) {
      throw new BadRequestException('Выберите роль из списка');
    }
    const roleOther =
      role === 'other'
        ? requireText(body?.roleOther, MAX_ROLE_OTHER_LENGTH, 'название роли')
        : null;
    const message = requireText(
      body?.message,
      MAX_MESSAGE_LENGTH,
      'сопроводительное сообщение',
    );
    const contactEmail = normalizeEmail(body?.contactEmail);
    const contactTelegram = normalizeTelegram(body?.contactTelegram);
    const contactName = optionalText(body?.contactName, MAX_CONTACT_LENGTH);
    const portfolioUrl = normalizeUrl(body?.portfolioUrl);

    if (!contactEmail && !contactTelegram) {
      throw new BadRequestException(
        'Оставьте email или Telegram — иначе мы не сможем ответить',
      );
    }

    const application = await this.prisma.teamApplication.create({
      data: {
        role,
        roleOther,
        contactName,
        contactEmail,
        contactTelegram,
        message,
        portfolioUrl,
        userId: author?.sub ?? null,
      },
      select: { id: true, status: true, createdAt: true },
    });
    void this.notifyAdmins(application.id, role);

    return {
      id: application.id,
      status: application.status,
      createdAt: application.createdAt.toISOString(),
    };
  }

  async adminList(
    role: Role,
    status?: string,
  ): Promise<AdminTeamApplicationListResponse> {
    ensureAdmin(role);
    const filter = STATUSES.includes(status as TeamApplicationStatus)
      ? (status as TeamApplicationStatus)
      : undefined;

    const [items, newCount] = await Promise.all([
      this.prisma.teamApplication.findMany({
        where: filter ? { status: filter } : undefined,
        orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
        take: 200,
      }),
      this.prisma.teamApplication.count({ where: { status: 'submitted' } }),
    ]);

    return {
      items: items.map(toDto),
      newCount,
    };
  }

  async adminGet(role: Role, id: string): Promise<TeamApplicationDto> {
    ensureAdmin(role);
    const application = await this.prisma.teamApplication.findUnique({
      where: { id },
    });
    if (!application) throw new NotFoundException('Заявка не найдена');
    return toDto(application);
  }

  async adminUpdate(
    role: Role,
    id: string,
    body: AdminUpdateTeamApplicationRequest,
  ): Promise<TeamApplicationDto> {
    ensureAdmin(role);
    const application = await this.prisma.teamApplication.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!application) throw new NotFoundException('Заявка не найдена');

    const data: {
      status?: TeamApplicationStatus;
      adminNote?: string | null;
    } = {};
    if (body?.status !== undefined) {
      if (!STATUSES.includes(body.status)) {
        throw new BadRequestException('Недопустимый статус заявки');
      }
      data.status = body.status;
    }
    if (body && 'adminNote' in body) {
      data.adminNote = optionalText(body.adminNote, MAX_MESSAGE_LENGTH);
    }
    if (Object.keys(data).length === 0) {
      throw new BadRequestException('Нечего обновлять');
    }

    await this.prisma.teamApplication.update({ where: { id }, data });
    return this.adminGet(role, id);
  }

  /**
   * Сообщить администраторам о новой заявке. Получателей читаем из `User` —
   * портальная модель, открытая сервисам на чтение. Ошибка не должна ронять
   * создание заявки — то же решение, что в SupportService.notifyAdmins.
   */
  private async notifyAdmins(
    applicationId: string,
    role: TeamApplicationRole,
  ): Promise<void> {
    try {
      const admins = await this.prisma.user.findMany({
        where: {
          role: { in: ['admin', 'service_admin'] },
          accountStatus: 'active',
        },
        select: { id: true },
      });
      for (const admin of admins) {
        const event = {
          name: 'team.application.received',
          recipientId: admin.id,
          applicationId,
          roleLabel: ROLE_LABELS[role],
        } satisfies NotificationEvent;
        this.events.emit(event.name, event);
      }
    } catch (error) {
      this.logger.error(
        `Не удалось уведомить админов о заявке ${applicationId}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}

interface ApplicationRow {
  id: string;
  role: TeamApplicationRole;
  roleOther: string | null;
  contactName: string | null;
  contactEmail: string | null;
  contactTelegram: string | null;
  message: string;
  portfolioUrl: string | null;
  status: TeamApplicationStatus;
  adminNote: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function toDto(application: ApplicationRow): TeamApplicationDto {
  return {
    id: application.id,
    role: application.role,
    roleOther: application.roleOther,
    contactName: application.contactName,
    contactEmail: application.contactEmail,
    contactTelegram: application.contactTelegram,
    message: application.message,
    portfolioUrl: application.portfolioUrl,
    status: application.status,
    adminNote: application.adminNote,
    createdAt: application.createdAt.toISOString(),
    updatedAt: application.updatedAt.toISOString(),
  };
}

function ensureAdmin(role: Role): void {
  if (role !== 'admin') {
    throw new ForbiddenException('Доступ только для администратора');
  }
}

function requireText(
  value: unknown,
  maxLength: number,
  label: string,
): string {
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

function normalizeUrl(value: unknown): string | null {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw) return null;
  if (raw.length > MAX_URL_LENGTH) {
    throw new BadRequestException(
      `Слишком длинная ссылка: максимум ${MAX_URL_LENGTH} символов`,
    );
  }
  try {
    const url = new URL(raw);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new Error('unsupported protocol');
    }
  } catch {
    throw new BadRequestException('Некорректная ссылка на портфолио');
  }
  return raw;
}
