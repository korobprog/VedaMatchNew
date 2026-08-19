import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DeleteObjectsCommand, S3Client } from '@aws-sdk/client-s3';
import type { Prisma } from '@prisma/client';
import type {
  AdminBlockUserRequest,
  AdminDeleteUserRequest,
  AdminPurgeUserRequest,
  AdminPurgeUserResponse,
  AdminManualStageUpdateRequest,
  AdminMentorVerificationRequest,
  AdminRoleUpdateRequest,
  AdminUserDetail,
  AdminUserListResponse,
  DevoteeVerificationStatus,
  Role,
  SelfIdentificationAnswers,
  ServiceCard,
  SpiritualStage,
  StageHistoryItem,
  UserAccountStatus,
} from '@vedamatch/shared';
import { resolveDisplayName } from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { toRole } from '../auth/role';
import {
  parseMessengers,
  parseSocialLinks,
  parseLocation,
} from './profile-parsers';
import { calculateAge, toBirthDateInput } from './age';
import { toPhotoVerificationState } from './photo-verification';
import { toSubscriptionState } from '../billing/subscription';
import { readBillingMode } from '../billing/billing-mode';
import { deletionEligibleAt } from './account-status';
import { isAnonymizedEmail } from './account-anonymize.service';
import { isPurgeConfirmed, mergePurgeContributions } from './user-purge';
import { UsersService } from './users.service';

/**
 * Портал просит сервисы отдать ключи объектов удаляемого аккаунта. Событие
 * самодостаточно: подписчик ищет только в своих таблицах по `userId`.
 * Имя дублируется в каждом сервисе — модули не импортируют друг друга.
 */
const USER_PURGE_REQUESTED = 'portal.user.purge-requested';

/** Предел DeleteObjects в S3-совместимых хранилищах. */
const S3_DELETE_BATCH = 1000;

const ROLES: Role[] = ['user', 'admin', 'service-admin'];
const ACCOUNT_STATUSES: UserAccountStatus[] = ['active', 'blocked', 'deleted'];
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
  accountStatus?: string;
  page?: string;
  pageSize?: string;
  sortBy?: string;
  sortDir?: string;
}

@Injectable()
export class AdminUsersService {
  private readonly logger = new Logger(AdminUsersService.name);
  private readonly s3Client: S3Client | null;
  private readonly bucket: string | undefined;

  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
    private readonly config: ConfigService,
    private readonly events: EventEmitter2,
  ) {
    const region = this.config.get<string>('S3_REGION');
    const accessKeyId = this.config.get<string>('S3_ACCESS_KEY');
    const secretAccessKey = this.config.get<string>('S3_SECRET_KEY');
    const endpoint = this.config.get<string>('S3_ENDPOINT');

    this.bucket = this.config.get<string>('S3_BUCKET_NAME');
    this.s3Client =
      region && accessKeyId && secretAccessKey
        ? new S3Client({
            region,
            endpoint: endpoint || undefined,
            forcePathStyle: Boolean(endpoint),
            credentials: { accessKeyId, secretAccessKey },
          })
        : null;
  }

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
      items: await Promise.all(
        users.map(async (user) => {
          const mentorRequest = user.mentorVerificationRequests[0] ?? null;
          return {
            id: user.id,
            email: user.email,
            name: user.name,
            avatarUrl: await this.users.resolveAvatarUrl(user),
            role: toRole(user.role),
            spiritualStage: user.spiritualStage,
            devoteeVerificationStatus: user.devoteeVerificationStatus,
            lastSelfIdentificationAt:
              user.lastSelfIdentificationAt?.toISOString() ?? null,
            createdAt: user.createdAt.toISOString(),
            updatedAt: user.updatedAt.toISOString(),
            hasMentorRequest: Boolean(mentorRequest),
            mentorRequestStatus: mentorRequest?.status ?? null,
            accountStatus: user.accountStatus,
            blockedUntil: user.blockedUntil?.toISOString() ?? null,
            deletedAt: user.deletedAt?.toISOString() ?? null,
          };
        }),
      ),
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

    const [availableServices, billingMode] = await Promise.all([
      this.getAvailableServicesFor(user.id, toRole(user.role)),
      readBillingMode(this.prisma),
    ]);

    return {
      profile: {
        id: user.id,
        email: user.email,
        // Администрация видит и мирское, и духовное имя: карточка модерации —
        // единственное место, где нужно точно понимать, кто перед тобой.
        name: user.name,
        spiritualName: user.spiritualName,
        displayName: resolveDisplayName(user),
        avatarUrl: await this.users.resolveAvatarUrl(user),
        avatarKey: user.avatarKey,
        birthDate: toBirthDateInput(user.birthDate),
        age: calculateAge(user.birthDate),
        gender: user.gender,
        photoVerification: toPhotoVerificationState(user),
        homeLocation: parseLocation(user.homeLocation),
        socialLinks: parseSocialLinks(user.socialLinks),
        messengers: parseMessengers(user.messengers),
        role: toRole(user.role),
        spiritualStage: user.spiritualStage,
        devoteeVerificationStatus: user.devoteeVerificationStatus,
        lastSelfIdentificationAt:
          user.lastSelfIdentificationAt?.toISOString() ?? null,
        subscription: toSubscriptionState(user, new Date(), billingMode),
        createdAt: user.createdAt.toISOString(),
        updatedAt: user.updatedAt.toISOString(),
        accountStatus: user.accountStatus,
        pendingDeletionAt: user.pendingDeletionAt?.toISOString() ?? null,
        deletionEligibleAt: user.pendingDeletionAt
          ? deletionEligibleAt(user.pendingDeletionAt).toISOString()
          : null,
        statusReason: user.statusReason,
        blockedUntil: user.blockedUntil?.toISOString() ?? null,
        deletedAt: user.deletedAt?.toISOString() ?? null,
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

  async updateRole(
    admin: { sub: string; role: Role },
    userId: string,
    body: AdminRoleUpdateRequest,
  ): Promise<AdminUserDetail> {
    this.ensureAdmin(admin.role);

    if (!body.role || !ROLES.includes(body.role)) {
      throw new BadRequestException('Некорректная роль');
    }

    if (admin.sub === userId && !body.confirmSelfChange) {
      throw new BadRequestException(
        'Для изменения собственной роли нужно явное подтверждение',
      );
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Пользователь не найден');

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        role: body.role.replace('-', '_') as Prisma.UserUpdateInput['role'],
      },
    });

    return this.getUser(admin.role, userId);
  }

  async setBlocked(
    admin: { sub: string; role: Role },
    userId: string,
    body: AdminBlockUserRequest,
  ): Promise<AdminUserDetail> {
    this.ensureAdmin(admin.role);

    if (admin.sub === userId) {
      throw new BadRequestException('Нельзя заблокировать собственный аккаунт');
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Пользователь не найден');

    if (body.blocked) {
      const reason = body.reason?.trim() ?? '';
      if (reason.length < 5) {
        throw new BadRequestException(
          'Укажите причину блокировки минимум 5 символов',
        );
      }
      const blockedUntil = body.blockedUntil
        ? new Date(body.blockedUntil)
        : null;
      if (blockedUntil && Number.isNaN(blockedUntil.getTime())) {
        throw new BadRequestException('Некорректная дата окончания блокировки');
      }

      await this.prisma.$transaction([
        this.prisma.refreshToken.updateMany({
          where: { userId },
          data: { revoked: true },
        }),
        this.prisma.user.update({
          where: { id: userId },
          data: {
            accountStatus: 'blocked',
            statusReason: reason,
            statusActor: 'admin',
            statusChangedAt: new Date(),
            blockedUntil,
          },
        }),
      ]);
    } else {
      // Разблокировать можно только заблокированного: удалённый аккаунт
      // иначе становился бы «активным» с заполненным deletedAt.
      if (user.accountStatus !== 'blocked') {
        throw new BadRequestException('Аккаунт не заблокирован');
      }
      await this.prisma.user.update({
        where: { id: userId },
        data: {
          accountStatus: 'active',
          statusReason: null,
          statusActor: 'admin',
          statusChangedAt: new Date(),
          blockedUntil: null,
        },
      });
    }

    return this.getUser(admin.role, userId);
  }

  async softDeleteUser(
    admin: { sub: string; role: Role },
    userId: string,
    body: AdminDeleteUserRequest,
  ): Promise<AdminUserDetail> {
    this.ensureAdmin(admin.role);

    const reason = body.reason?.trim() ?? '';
    if (reason.length < 5) {
      throw new BadRequestException(
        'Укажите причину удаления минимум 5 символов',
      );
    }
    if (admin.sub === userId && !body.confirmSelfDelete) {
      throw new BadRequestException(
        'Для удаления собственного аккаунта нужно явное подтверждение',
      );
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Пользователь не найден');

    await this.prisma.$transaction([
      this.prisma.refreshToken.updateMany({
        where: { userId },
        data: { revoked: true },
      }),
      this.prisma.user.update({
        where: { id: userId },
        data: {
          accountStatus: 'deleted',
          deletedAt: new Date(),
          pendingDeletionAt: null,
          statusReason: reason,
          statusActor: 'admin',
          statusChangedAt: new Date(),
        },
      }),
    ]);

    return this.getUser(admin.role, userId);
  }

  /**
   * Безвозвратно сносит аккаунт: строку `User`, все сервисные данные каскадом
   * и загруженные файлы из хранилища. Отмены нет — `restoreUser` тут не
   * поможет, восстанавливать будет нечего.
   *
   * Порядок важен. Сначала сервисы по событию отдают ключи своих объектов —
   * после каскада найти их уже негде. Потом удаляется строка, и только после
   * успешного удаления чистится хранилище: осиротевший файл в бакете лучше,
   * чем битая карточка с пропавшей картинкой.
   */
  async purgeUser(
    admin: { sub: string; role: Role },
    userId: string,
    body: AdminPurgeUserRequest,
  ): Promise<AdminPurgeUserResponse> {
    this.ensureAdmin(admin.role);

    const reason = body.reason?.trim() ?? '';
    if (reason.length < 5) {
      throw new BadRequestException(
        'Укажите причину удаления минимум 5 символов',
      );
    }
    if (admin.sub === userId && !body.confirmSelfDelete) {
      throw new BadRequestException(
        'Для удаления собственного аккаунта нужно явное подтверждение',
      );
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, avatarKey: true },
    });
    if (!user) throw new NotFoundException('Пользователь не найден');

    if (!isPurgeConfirmed(body.confirmEmail, user.email)) {
      throw new BadRequestException(
        'Для безвозвратного удаления введите email аккаунта точно',
      );
    }

    // emitAsync отдаёт `any[]`: возвращать подписчики могут что угодно,
    // разбирается с этим mergePurgeContributions.
    const contributions = (await this.events.emitAsync(USER_PURGE_REQUESTED, {
      userId,
    })) as unknown[];
    const plan = mergePurgeContributions([
      await this.collectOwnPurgeContribution(user.id, user.avatarKey),
      ...contributions,
    ]);

    await this.prisma.user.delete({ where: { id: userId } });
    this.logger.warn(
      `Безвозвратно удалён аккаунт ${user.email} (${userId}) администратором ${admin.sub}: ${reason}`,
    );

    const storageFailures = await this.removeStorageObjects(plan.storageKeys);

    return {
      id: user.id,
      email: user.email,
      counts: plan.counts,
      storageObjects: plan.storageKeys.length - storageFailures,
      storageFailures,
    };
  }

  /** Портальные объекты пользователя: аватар и галерея. */
  private async collectOwnPurgeContribution(
    userId: string,
    avatarKey: string | null,
  ) {
    const photos = await this.prisma.userPhoto.findMany({
      where: { userId },
      select: { storageKey: true },
    });
    return {
      storageKeys: [
        ...(avatarKey ? [avatarKey] : []),
        ...photos.map((photo) => photo.storageKey),
      ],
      counts: { photos: photos.length },
    };
  }

  /**
   * Чистит бакет пачками по 1000 ключей — предел DeleteObjects у S3.
   * Возвращает число объектов, которые удалить не удалось: строка в базе уже
   * снесена, и падать из-за хранилища поздно, но администратору знать полезно.
   */
  private async removeStorageObjects(keys: string[]): Promise<number> {
    if (keys.length === 0) return 0;
    if (!this.s3Client || !this.bucket) {
      this.logger.warn(
        `Хранилище не настроено: ${keys.length} объектов удалённого аккаунта остались в бакете`,
      );
      return keys.length;
    }

    let failures = 0;
    for (let offset = 0; offset < keys.length; offset += S3_DELETE_BATCH) {
      const batch = keys.slice(offset, offset + S3_DELETE_BATCH);
      try {
        const result = await this.s3Client.send(
          new DeleteObjectsCommand({
            Bucket: this.bucket,
            Delete: { Objects: batch.map((Key) => ({ Key })), Quiet: true },
          }),
        );
        failures += result.Errors?.length ?? 0;
      } catch (error) {
        failures += batch.length;
        this.logger.warn(
          `Не удалось удалить объекты аккаунта: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
    return failures;
  }

  async restoreUser(
    admin: { sub: string; role: Role },
    userId: string,
  ): Promise<AdminUserDetail> {
    this.ensureAdmin(admin.role);

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Пользователь не найден');
    // Восстановление — только из удалённого/ожидающего удаления состояния;
    // блокировку снимает setBlocked, у него своя семантика и журнал.
    if (user.accountStatus !== 'deleted' && user.pendingDeletionAt === null) {
      throw new BadRequestException('Аккаунт не удалён');
    }
    // После анонимизации восстанавливать нечего: PII стёрты, email занят маркером.
    if (isAnonymizedEmail(user.email)) {
      throw new BadRequestException(
        'Аккаунт анонимизирован, восстановление невозможно',
      );
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        accountStatus: 'active',
        deletedAt: null,
        pendingDeletionAt: null,
        blockedUntil: null,
        statusReason: null,
        statusActor: 'admin',
        statusChangedAt: new Date(),
      },
    });

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
      // Духовное имя ищем наравне с мирским: в переписке человек называет
      // себя именно им, и админ ищет по тому имени, которое ему назвали.
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { spiritualName: { contains: q, mode: 'insensitive' } },
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

    if (
      query.accountStatus &&
      ACCOUNT_STATUSES.includes(query.accountStatus as UserAccountStatus)
    ) {
      where.accountStatus = query.accountStatus as UserAccountStatus;
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
