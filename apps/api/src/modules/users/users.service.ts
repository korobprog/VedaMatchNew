import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  ABOUT_MAX_LENGTH,
  LANGUAGES_MAX,
  findNameError,
  isLineageId,
  resolveDisplayName,
  toLineageId,
  type AdminAuditEvent,
  type Gender,
  type ProfileLocation,
  type ProfileMessengers,
  type ProfileSocialLinks,
  type ProfileUpdateRequest,
  type Role,
  type UserProfile,
} from '@vedamatch/shared';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { normalizeStatusLine } from './status-line';
import { PrismaService } from '../../prisma/prisma.service';
import { PersonalDataService } from '../personal-data/personal-data.service';
import { pickPersonal } from '../personal-data/personal-fields';
import { toRole } from '../auth/role';
import { toSubscriptionState } from '../billing/subscription';
import { readBillingMode } from '../billing/billing-mode';
import { calculateAge, parseBirthDate, toBirthDateInput } from './age';
import { normalizeLanguages } from './languages';
import {
  RESET_PHOTO_VERIFICATION,
  toPhotoVerificationState,
} from './photo-verification';
import { deletionEligibleAt } from './account-status';

const GENDERS: Gender[] = ['male', 'female'];

const MAX_AVATAR_SIZE = 5 * 1024 * 1024;
/** Аватар кэшируется как immutable, поэтому подписываем надолго — до недели, максимум для SigV4. */
const AVATAR_SIGNED_URL_TTL_SECONDS = 7 * 24 * 60 * 60;
const AVATAR_MIME_EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};
const SOCIAL_KEYS: Array<keyof ProfileSocialLinks> = [
  'instagram',
  'telegram',
  'x',
  'facebook',
  'linkedin',
  'vk',
  'tiktok',
  'youtube',
  'website',
];
const MESSENGER_KEYS: Array<keyof ProfileMessengers> = [
  'telegram',
  'whatsapp',
  'mx',
  'phone',
];

export interface UploadedAvatarFile {
  buffer: Buffer;
  mimetype: string;
  originalname?: string;
  size: number;
}

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);
  private readonly s3Client: S3Client | null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly events: EventEmitter2,
    private readonly personal: PersonalDataService,
  ) {
    const region = this.config.get<string>('S3_REGION');
    const accessKeyId = this.config.get<string>('S3_ACCESS_KEY');
    const secretAccessKey = this.config.get<string>('S3_SECRET_KEY');
    const endpoint = this.config.get<string>('S3_ENDPOINT');

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

  /**
   * Аватар из Google OAuth — уже публичный URL, отдаём как есть. Загруженный
   * пользователем аватар лежит в приватном бакете (как и галерея), поэтому
   * его нужно каждый раз подписывать заново, а не отдавать сохранённый URL.
   */
  async resolveAvatarUrl(user: {
    avatarKey: string | null;
    avatarUrl: string | null;
  }): Promise<string | null> {
    if (!user.avatarKey) return user.avatarUrl;
    const bucket = this.config.get<string>('S3_BUCKET_NAME');
    if (!this.s3Client || !bucket) return null;
    return getSignedUrl(
      this.s3Client as unknown as Parameters<typeof getSignedUrl>[0],
      new GetObjectCommand({ Bucket: bucket, Key: user.avatarKey }),
      { expiresIn: AVATAR_SIGNED_URL_TTL_SECONDS },
    );
  }

  async getProfile(userId: string): Promise<UserProfile> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Пользователь не найден');
    const billingMode = await readBillingMode(this.prisma);
    const adminServices = await this.loadAdminServices(user.role, user.id);
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      spiritualName: user.spiritualName,
      displayName: resolveDisplayName(user),
      avatarUrl: await this.resolveAvatarUrl(user),
      avatarKey: user.avatarKey,
      birthDate: toBirthDateInput(user.birthDate),
      age: calculateAge(user.birthDate),
      gender: user.gender,
      photoVerification: toPhotoVerificationState(user),
      about: user.about,
      statusLine: user.statusLine,
      languages: user.languages,
      homeLocation: parseLocation(user.homeLocation),
      socialLinks: parseSocialLinks(user.socialLinks),
      messengers: parseMessengers(user.messengers),
      role: toRole(user.role),
      adminServices,
      spiritualStage: user.spiritualStage,
      devoteeVerificationStatus: user.devoteeVerificationStatus,
      lastSelfIdentificationAt:
        user.lastSelfIdentificationAt?.toISOString() ?? null,
      lineage: toLineageId(user.lineage),
      timeZone: user.timeZone,
      timeZoneLocked: user.timeZoneLocked,
      subscription: toSubscriptionState(user, new Date(), billingMode),
      accountStatus: user.accountStatus,
      pendingDeletionAt: user.pendingDeletionAt?.toISOString() ?? null,
      deletionEligibleAt: user.pendingDeletionAt
        ? deletionEligibleAt(user.pendingDeletionAt).toISOString()
        : null,
      createdAt: user.createdAt.toISOString(),
    };
  }

  /**
   * Сервисы, которыми управляет администратор сервиса. У остальных ролей пусто:
   * `admin` и так имеет полный доступ, а `user` — никакого.
   */
  private async loadAdminServices(
    dbRole: string,
    userId: string,
  ): Promise<string[]> {
    if (dbRole !== 'service_admin') return [];
    const scopes = await this.prisma.serviceAdmin.findMany({
      where: { userId },
      select: { service: { select: { slug: true } } },
    });
    return scopes.map((scope) => scope.service.slug);
  }

  /** Самостоятельный запрос на удаление аккаунта: не разлогинивает, даёт окно на отмену. */
  async requestSelfDeletion(userId: string): Promise<UserProfile> {
    const user = await this.ensureUser(userId);
    if (!user.pendingDeletionAt) {
      await this.prisma.user.update({
        where: { id: userId },
        data: {
          pendingDeletionAt: new Date(),
          statusActor: 'user',
          statusReason: 'Запрошено пользователем',
          statusChangedAt: new Date(),
        },
      });
    }
    return this.getProfile(userId);
  }

  async cancelSelfDeletion(userId: string): Promise<UserProfile> {
    await this.ensureUser(userId);
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        pendingDeletionAt: null,
        statusActor: 'user',
        statusReason: null,
        statusChangedAt: new Date(),
      },
    });
    return this.getProfile(userId);
  }

  /**
   * Правка `User` через российский контур: для россиянина персональные поля
   * обязаны сначала уехать в московскую базу. Напрямую `user.update` с
   * персональными полями звать нельзя — порядок записи перестанет
   * соблюдаться там, где о нём забыли.
   *
   * Снимок «после» собирается из состояния до правки, наложенного правкой:
   * в московскую базу уезжает полное состояние, а не дельта.
   */
  /**
   * Правка `User` через российский контур: для россиянина персональные поля
   * обязаны сначала уехать в московскую базу. Напрямую `user.update` с
   * персональными полями звать нельзя — порядок записи перестанет
   * соблюдаться там, где о нём забыли.
   */
  private async writePersonal(userId: string, data: Prisma.UserUpdateInput) {
    return this.personal.writeFor(
      userId,
      () => this.prisma.user.update({ where: { id: userId }, data }),
      { fields: pickPersonal(data as Record<string, unknown>) },
    );
  }

  async updateProfile(
    userId: string,
    payload: ProfileUpdateRequest,
  ): Promise<UserProfile> {
    await this.ensureUser(userId);

    const data: Prisma.UserUpdateInput = {};

    if ('name' in payload) {
      const name = payload.name?.trim() ?? '';
      // Жёсткая часть проверки — общая с формой на вебе, см. findNameError.
      // Подсказки о странном написании форма показывает сама: они не повод
      // отказать, иначе редкое настоящее имя было бы некуда вписать.
      const error = findNameError(name, 'Имя');
      if (error) {
        throw new BadRequestException(error);
      }
      data.name = name;
    }
    if ('spiritualName' in payload) {
      const spiritualName = payload.spiritualName?.trim() ?? '';
      // Духовное имя необязательно, поэтому проверяем только заполненное:
      // пустая строка ниже означает «убрать».
      if (spiritualName) {
        const error = findNameError(spiritualName, 'Духовное имя');
        if (error) {
          throw new BadRequestException(error);
        }
      }
      // Пустая строка — это «убрать», а не «сохранить пустоту»: иначе
      // resolveDisplayName пришлось бы отличать '' от null на каждом вызове.
      data.spiritualName = spiritualName || null;
    }
    if ('birthDate' in payload) {
      const birthDate = parseBirthDate(payload.birthDate);
      if (birthDate && 'error' in birthDate) {
        throw new BadRequestException(birthDate.error);
      }
      data.birthDate = birthDate;
    }
    if ('gender' in payload) {
      // Пол обязателен: по нему работает подбор в Знакомствах и обращения в
      // текстах портала. В базе колонка осталась необязательной ради старых
      // аккаунтов — их догоняет мастер приветствия, — но убрать уже
      // указанный пол или сохранить профиль без него нельзя.
      if (payload.gender == null) {
        throw new BadRequestException('Укажите пол');
      }
      if (!GENDERS.includes(payload.gender)) {
        throw new BadRequestException('Недопустимое значение пола');
      }
      data.gender = payload.gender;
    }
    if ('about' in payload) {
      const about = payload.about?.trim() ?? '';
      if (about.length > ABOUT_MAX_LENGTH) {
        throw new BadRequestException(
          `Рассказ о себе не длиннее ${ABOUT_MAX_LENGTH} символов`,
        );
      }
      // Пустая строка — «убрать», как и у духовного имени: пустой рассказ и
      // отсутствующий это одно и то же, а различать их пришлось бы везде.
      data.about = about || null;
    }
    if ('statusLine' in payload) {
      data.statusLine = normalizeStatusLine(payload.statusLine);
    }
    if ('lineage' in payload) {
      // Справочник общий с вебом; значение вне него — ошибка формы, а не
      // повод завести в базе новую линию строкой.
      if (payload.lineage != null && !isLineageId(payload.lineage)) {
        throw new BadRequestException('Неизвестная духовная линия');
      }
      // Этап здесь не проверяется: линию можно указать заранее, до анкеты, а
      // показывается она всё равно только преданному — см. isDevotee.
      data.lineage = payload.lineage ?? null;
    }
    if ('timeZone' in payload) {
      // Ручной выбор. Значение фиксирует пояс: у кого VPN или система врут,
      // тот решил сам, и автоопределение больше не спорит. null — снять
      // фиксацию, пояс придёт с устройства при следующем входе.
      const timeZone = payload.timeZone?.trim() || null;
      if (timeZone && !isValidTimeZone(timeZone)) {
        throw new BadRequestException('Неизвестный часовой пояс');
      }
      data.timeZone = timeZone;
      data.timeZoneLocked = timeZone !== null;
    } else if (payload.detectedTimeZone !== undefined) {
      const detected = payload.detectedTimeZone?.trim();
      if (detected && isValidTimeZone(detected)) {
        const current = await this.prisma.user.findUnique({
          where: { id: userId },
          select: { timeZoneLocked: true },
        });
        if (!current?.timeZoneLocked) data.timeZone = detected;
      }
    }
    if ('languages' in payload) {
      data.languages = normalizeLanguages(payload.languages);
    }
    if ('homeLocation' in payload) {
      data.homeLocation = payload.homeLocation
        ? (sanitizeLocation(
            payload.homeLocation,
          ) as unknown as Prisma.InputJsonObject)
        : Prisma.DbNull;
    }
    if ('socialLinks' in payload) {
      data.socialLinks = sanitizeKeyValueMap(
        payload.socialLinks,
        SOCIAL_KEYS,
      ) as unknown as Prisma.InputJsonObject;
    }
    if ('messengers' in payload) {
      data.messengers = sanitizeKeyValueMap(
        payload.messengers,
        MESSENGER_KEYS,
      ) as unknown as Prisma.InputJsonObject;
    }

    await this.writePersonal(userId, data);
    return this.getProfile(userId);
  }

  /** Заявка на проверку фото: подтверждать может только администрация. */
  async requestPhotoVerification(userId: string): Promise<UserProfile> {
    await this.ensureUser(userId);
    const publicPhotos = await this.prisma.userPhoto.count({
      where: { userId, isPublic: true },
    });
    if (publicPhotos === 0) {
      throw new BadRequestException(
        'Откройте хотя бы одно фото в галерее — проверять нечего',
      );
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { photoVerificationRequestedAt: new Date(), photoVerifiedAt: null },
    });
    return this.getProfile(userId);
  }

  async setPhotoVerification(
    admin: { sub: string; role: Role },
    userId: string,
    verified: boolean,
  ): Promise<UserProfile> {
    if (admin.role !== 'admin') {
      throw new ForbiddenException('Доступ только для администратора');
    }
    await this.ensureUser(userId);

    await this.prisma.user.update({
      where: { id: userId },
      data: verified
        ? { photoVerifiedAt: new Date(), photoVerificationRequestedAt: null }
        : RESET_PHOTO_VERIFICATION,
    });

    const event: AdminAuditEvent = {
      actorId: admin.sub,
      action: verified ? 'user.photo-verified' : 'user.photo-unverified',
      targetType: 'user',
      targetId: userId,
    };
    this.events.emit('admin.action', event);
    return this.getProfile(userId);
  }

  async uploadAvatar(
    userId: string,
    file: UploadedAvatarFile | undefined,
  ): Promise<UserProfile> {
    if (!file) throw new BadRequestException('Файл аватара не передан');
    const extension = AVATAR_MIME_EXTENSIONS[file.mimetype];
    if (!extension) {
      throw new BadRequestException('Разрешены только jpg, jpeg, png и webp');
    }
    if (file.size > MAX_AVATAR_SIZE) {
      throw new BadRequestException('Размер аватара не должен превышать 5 MB');
    }

    const bucket = this.config.get<string>('S3_BUCKET_NAME');
    const publicUrl = this.config.get<string>('S3_PUBLIC_URL');
    if (!this.s3Client || !bucket || !publicUrl) {
      throw new BadRequestException('S3-хранилище не настроено');
    }

    const user = await this.ensureUser(userId);
    const key = `users/${userId}/avatar.${extension}`;
    await this.s3Client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype,
        CacheControl: 'public, max-age=31536000, immutable',
      }),
    );

    if (user.avatarKey && user.avatarKey !== key) {
      await this.deleteAvatarObject(user.avatarKey);
    }

    // avatarUrl остаётся null для загруженных аватаров: бакет приватный, и
    // рабочую ссылку можно получить только подписью (см. resolveAvatarUrl).
    // Через контур: ключ аватара — персональные данные.
    await this.writePersonal(userId, { avatarKey: key, avatarUrl: null });

    return this.getProfile(userId);
  }

  async deleteAvatar(userId: string): Promise<UserProfile> {
    const user = await this.ensureUser(userId);
    if (user.avatarKey) await this.deleteAvatarObject(user.avatarKey);
    await this.writePersonal(userId, { avatarKey: null, avatarUrl: null });
    return this.getProfile(userId);
  }

  private async ensureUser(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Пользователь не найден');
    return user;
  }

  private async deleteAvatarObject(key: string) {
    const bucket = this.config.get<string>('S3_BUCKET_NAME');
    if (!this.s3Client || !bucket) return;
    try {
      await this.s3Client.send(
        new DeleteObjectCommand({ Bucket: bucket, Key: key }),
      );
    } catch (error) {
      this.logger.warn(
        `Не удалось удалить старый аватар из S3: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}

function parseLocation(value: unknown): ProfileLocation | null {
  if (!value || typeof value !== 'object') return null;
  try {
    return sanitizeLocation(value as ProfileLocation);
  } catch {
    return null;
  }
}

function parseSocialLinks(value: unknown): ProfileSocialLinks {
  return sanitizeKeyValueMap(value as ProfileSocialLinks, SOCIAL_KEYS);
}

function parseMessengers(value: unknown): ProfileMessengers {
  return sanitizeKeyValueMap(value as ProfileMessengers, MESSENGER_KEYS);
}

function sanitizeLocation(location: ProfileLocation): ProfileLocation {
  const city = sanitizeString(location.city, 120);
  if (!city) throw new BadRequestException('Укажите город');

  const lat = Number(location.lat);
  const lon = Number(location.lon);
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
    throw new BadRequestException('Некорректная широта');
  }
  if (!Number.isFinite(lon) || lon < -180 || lon > 180) {
    throw new BadRequestException('Некорректная долгота');
  }

  return {
    city,
    country: sanitizeString(location.country, 120) || undefined,
    lat: roundCoordinate(lat),
    lon: roundCoordinate(lon),
    displayName: sanitizeString(location.displayName, 240) || undefined,
  };
}

function sanitizeKeyValueMap<T extends object>(
  value: T | null | undefined,
  keys: readonly string[],
): T {
  const result: Record<string, string> = {};
  if (!value || typeof value !== 'object') return result as T;
  const source = value as Record<string, unknown>;

  for (const key of keys) {
    const sanitized = sanitizeString(source[key], 300);
    if (!sanitized) continue;
    if (
      (key === 'phone' || key === 'mx') &&
      !/^\+[1-9]\d{6,14}$/.test(sanitized)
    ) {
      throw new BadRequestException(
        'Телефон должен быть в международном формате',
      );
    }
    result[String(key)] = sanitized;
  }

  return result as T;
}

function sanitizeString(value: unknown, maxLength: number): string {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLength);
}

function roundCoordinate(value: number): number {
  return Math.round(value * 10000) / 10000;
}

/**
 * Часовой пояс проверяется самим Intl, а не списком: список устаревает, а
 * `Intl.DateTimeFormat` знает ровно те зоны, по которым потом считается время.
 */
export function isValidTimeZone(value: string): boolean {
  if (value.length > 64) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}
