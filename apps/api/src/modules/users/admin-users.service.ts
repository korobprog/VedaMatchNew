import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type {
  AdminManualStageUpdateRequest,
  AdminMentorVerificationRequest,
  AdminUserDetail,
  AdminUserListResponse,
  DevoteeVerificationStatus,
  Role,
  SelfIdentificationAnswers,
  ServiceCard,
  SpiritualStage,
  StageHistoryItem,
} from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { toRole } from '../auth/auth.service';
import {
  parseMessengers,
  parseSocialLinks,
  parseLocation,
} from './profile-parsers';

const ROLES: Role[] = ['user', 'admin', 'service-admin'];
const STAGES: SpiritualStage[] = ['seeker', 'practitioner', 'yogi', 'devotee'];
const VERIFICATION_STATUSES: DevoteeVerificationStatus[] = [
  'self_identified',
  'awaiting_mentor',
  'mentor_submitted',
  'awaiting_admin',
  'confirmed',
  'rejected',
  'needs_clarification',
];

interface ListUsersQuery {
  q?: string;
  role?: string;
  spiritualStage?: string;
  verificationStatus?: string;
  hasMentorRequest?: string;
  page?: string;
  pageSize?: string;
  sortBy?: string;
  sortDir?: string;
}

@Injectable()
export class AdminUsersService {
  constructor(private readonly prisma: PrismaService) {}

  async listUsers(
    adminRole: Role,
    query: ListUsersQuery,
  ): Promise<AdminUserListResponse> {
    this.ensureAdmin(adminRole);

    const page = clampInt(query.page, 1, 10_000, 1);
    const pageSize = clampInt(query.pageSize, 1, 100, 20);
    const where = this.buildWhere(query);
    const orderBy = this.buildOrderBy(query);

    const [total, users] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          mentorVerificationRequests: {
            orderBy: { updatedAt: 'desc' },
            take: 1,
          },
        },
      }),
    ]);

    return {
      items: users.map((user) => {
        const mentorRequest = user.mentorVerificationRequests[0] ?? null;
        return {
          id: user.id,
          email: user.email,
          name: user.name,
          avatarUrl: user.avatarUrl,
          role: toRole(user.role),
          spiritualStage: user.spiritualStage,
          devoteeVerificationStatus: user.devoteeVerificationStatus,
          lastSelfIdentificationAt:
            user.lastSelfIdentificationAt?.toISOString() ?? null,
          createdAt: user.createdAt.toISOString(),
          updatedAt: user.updatedAt.toISOString(),
          hasMentorRequest: Boolean(mentorRequest),
          mentorRequestStatus: mentorRequest?.status ?? null,
        };
      }),
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  async getUser(adminRole: Role, userId: string): Promise<AdminUserDetail> {
    this.ensureAdmin(adminRole);

    const [user, latestResponse, history, mentorRequest] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: userId } }),
      this.prisma.selfIdentificationResponse.findFirst({
        where: { userId },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.stageHistory.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.mentorVerificationRequest.findFirst({
        where: { userId },
        orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
        include: { user: true },
      }),
    ]);

    if (!user) throw new NotFoundException('Пользователь не найден');

    const availableServices = await this.getAvailableServicesFor(
      user.id,
      toRole(user.role),
    );

    return {
      profile: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatarUrl: user.avatarUrl,
        avatarKey: user.avatarKey,
        homeLocation: parseLocation(user.homeLocation),
        socialLinks: parseSocialLinks(user.socialLinks),
        messengers: parseMessengers(user.messengers),
        role: toRole(user.role),
        spiritualStage: user.spiritualStage,
        devoteeVerificationStatus: user.devoteeVerificationStatus,
        lastSelfIdentificationAt:
          user.lastSelfIdentificationAt?.toISOString() ?? null,
        createdAt: user.createdAt.toISOString(),
        updatedAt: user.updatedAt.toISOString(),
      },
      availableServices,
      stageHistory: history.map(mapStageHistory),
      latestSelfIdentificationResponse: latestResponse
        ? {
            id: latestResponse.id,
            answers:
              latestResponse.answers as unknown as SelfIdentificationAnswers,
            detectedStage: latestResponse.detectedStage,
            verificationStatus: latestResponse.verificationStatus,
            createdAt: latestResponse.createdAt.toISOString(),
          }
        : null,
      mentorRequest: mentorRequest ? mapMentorRequest(mentorRequest) : null,
    };
  }

  async updateStage(
    admin: { sub: string; role: Role },
    userId: string,
    body: AdminManualStageUpdateRequest,
  ): Promise<AdminUserDetail> {
    this.ensureAdmin(admin.role);
    this.validateManualUpdate(body);

    if (admin.sub === userId && !body.confirmSelfChange) {
      throw new BadRequestException(
        'Для изменения собственного этапа нужно явное подтверждение',
      );
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Пользователь не найден');

    const nextStatus =
      body.spiritualStage === 'devotee'
        ? (body.devoteeVerificationStatus ?? 'self_identified')
        : null;

    if (
      user.devoteeVerificationStatus === 'confirmed' &&
      nextStatus !== 'confirmed' &&
      !body.confirmStatusDowngrade
    ) {
      throw new BadRequestException(
        'Для сброса подтвержденного статуса нужно явное подтверждение',
      );
    }

    const mentorRequest = await this.prisma.mentorVerificationRequest.findFirst(
      {
        where: { userId },
        orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
      },
    );

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: {
          spiritualStage: body.spiritualStage,
          devoteeVerificationStatus: nextStatus,
        },
      }),
      this.prisma.stageHistory.create({
        data: {
          userId,
          oldStage: user.spiritualStage,
          newStage: body.spiritualStage,
          actor: 'admin',
          reason: body.reason.trim(),
          verificationStatus: nextStatus,
          mentorRequestId: mentorRequest?.id ?? null,
        },
      }),
    ]);

    return this.getUser(admin.role, userId);
  }

  private ensureAdmin(role: Role) {
    if (role !== 'admin') {
      throw new ForbiddenException('Доступ только для администратора');
    }
  }

  private buildWhere(query: ListUsersQuery): Prisma.UserWhereInput {
    const where: Prisma.UserWhereInput = {};
    const q = query.q?.trim();

    if (q) {
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { email: { contains: q, mode: 'insensitive' } },
      ];
    }

    if (query.role && ROLES.includes(query.role as Role)) {
      where.role = query.role.replace(
        '-',
        '_',
      ) as Prisma.EnumRoleFilter['equals'];
    }

    if (
      query.spiritualStage &&
      STAGES.includes(query.spiritualStage as SpiritualStage)
    ) {
      where.spiritualStage = query.spiritualStage as SpiritualStage;
    }

    if (
      query.verificationStatus &&
      VERIFICATION_STATUSES.includes(
        query.verificationStatus as DevoteeVerificationStatus,
      )
    ) {
      where.devoteeVerificationStatus =
        query.verificationStatus as DevoteeVerificationStatus;
    }

    if (query.hasMentorRequest === 'true') {
      where.mentorVerificationRequests = { some: {} };
    }
    if (query.hasMentorRequest === 'false') {
      where.mentorVerificationRequests = { none: {} };
    }

    return where;
  }

  private buildOrderBy(
    query: ListUsersQuery,
  ): Prisma.UserOrderByWithRelationInput[] {
    const direction: Prisma.SortOrder =
      query.sortDir === 'asc' ? 'asc' : 'desc';
    if (query.sortBy === 'lastSelfIdentificationAt') {
      return [{ lastSelfIdentificationAt: direction }, { createdAt: 'desc' }];
    }
    if (query.sortBy === 'status') {
      return [{ devoteeVerificationStatus: direction }, { createdAt: 'desc' }];
    }
    return [{ createdAt: direction }];
  }

  private async getAvailableServicesFor(
    userId: string,
    role: Role,
  ): Promise<ServiceCard[]> {
    const isAdmin = role === 'admin' || role === 'service-admin';
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) return [];

    const stageFilters = user.spiritualStage
      ? stageVisibilityFilter(
          user.spiritualStage,
          user.devoteeVerificationStatus,
        )
      : [];

    const services = await this.prisma.service.findMany({
      where: isAdmin
        ? {}
        : {
            status: { not: 'disabled' },
            OR: [
              { public: true },
              { access: { some: { userId } } },
              ...stageFilters,
            ],
          },
      orderBy: [{ status: 'asc' }, { name: 'asc' }],
    });

    return services.map((s) => ({
      id: s.id,
      slug: s.slug,
      name: s.name,
      description: s.description,
      iconUrl: s.iconUrl,
      url: s.url,
      status: s.status,
      category: s.category,
      requiresDevoteeVerification:
        s.devoteeVerifiedVisible && !s.devoteeSelfIdentifiedVisible,
    }));
  }

  private validateManualUpdate(body: AdminManualStageUpdateRequest) {
    if (!STAGES.includes(body.spiritualStage)) {
      throw new BadRequestException('Некорректный духовный этап');
    }
    if (
      body.devoteeVerificationStatus &&
      !VERIFICATION_STATUSES.includes(body.devoteeVerificationStatus)
    ) {
      throw new BadRequestException('Некорректный статус подтверждения');
    }
    if (!body.reason || body.reason.trim().length < 5) {
      throw new BadRequestException(
        'Укажите причину изменения минимум 5 символов',
      );
    }
    if (body.reason.length > 1000) {
      throw new BadRequestException('Причина изменения слишком длинная');
    }
  }
}

function clampInt(
  value: string | undefined,
  min: number,
  max: number,
  fallback: number,
) {
  const parsed = Number.parseInt(value ?? '', 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function stageVisibilityFilter(
  stage: SpiritualStage,
  status: DevoteeVerificationStatus | null,
): Array<Record<string, boolean>> {
  if (stage === 'seeker') return [{ seekerVisible: true }];
  if (stage === 'practitioner') return [{ practitionerVisible: true }];
  if (stage === 'yogi') return [{ yogiVisible: true }];
  return status === 'confirmed'
    ? [{ devoteeSelfIdentifiedVisible: true }, { devoteeVerifiedVisible: true }]
    : [{ devoteeSelfIdentifiedVisible: true }];
}

function mapStageHistory(h: {
  id: string;
  oldStage: SpiritualStage | null;
  newStage: SpiritualStage;
  actor: 'system' | 'user' | 'admin';
  reason: string | null;
  verificationStatus: DevoteeVerificationStatus | null;
  createdAt: Date;
}): StageHistoryItem {
  return {
    id: h.id,
    oldStage: h.oldStage,
    newStage: h.newStage,
    actor: h.actor,
    reason: h.reason,
    verificationStatus: h.verificationStatus,
    createdAt: h.createdAt.toISOString(),
  };
}

function mapMentorRequest(r: {
  id: string;
  token: string;
  userId: string;
  user: { name: string; email: string };
  status: DevoteeVerificationStatus;
  mentorName: string | null;
  phone: string | null;
  email: string | null;
  cityOrCommunity: string | null;
  knownDuration: string | null;
  knowsPersonally: boolean | null;
  confirmsRegularPractice: boolean | null;
  confirmsService: boolean | null;
  confirmsSpiritualName: boolean | null;
  confirmsCommunityConnection: boolean | null;
  recommendsDevoteeStatus: boolean | null;
  userCharacterReference: string | null;
  adminNote: string | null;
  createdAt: Date;
  updatedAt: Date;
  mentorSubmittedAt: Date | null;
  adminReviewedAt: Date | null;
}): AdminMentorVerificationRequest {
  return {
    id: r.id,
    token: r.token,
    userId: r.userId,
    userName: r.user.name,
    userEmail: r.user.email,
    status: r.status,
    mentorName: r.mentorName,
    mentorPhone: r.phone,
    mentorEmail: r.email,
    cityOrCommunity: r.cityOrCommunity,
    knownDuration: r.knownDuration,
    knowsPersonally: r.knowsPersonally,
    confirmsRegularPractice: r.confirmsRegularPractice,
    confirmsService: r.confirmsService,
    confirmsSpiritualName: r.confirmsSpiritualName,
    confirmsCommunityConnection: r.confirmsCommunityConnection,
    recommendsDevoteeStatus: r.recommendsDevoteeStatus,
    userCharacterReference: r.userCharacterReference,
    adminNote: r.adminNote,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    mentorSubmittedAt: r.mentorSubmittedAt?.toISOString() ?? null,
    adminReviewedAt: r.adminReviewedAt?.toISOString() ?? null,
  };
}
