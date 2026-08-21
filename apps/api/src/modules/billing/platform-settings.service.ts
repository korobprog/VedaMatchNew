import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { REGISTRATION_NOTE_MAX_LENGTH } from '@vedamatch/shared';
import type {
  AdminAuditEvent,
  AdminPlatformSettings,
  AdminUpdatePlatformSettingsRequest,
  BillingMode,
  RegistrationMode,
} from '@vedamatch/shared';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../prisma/prisma.service';
import { APP_SETTINGS_ID } from './billing-mode';
import { collectIntegrationStatuses } from './integration-status';

const BILLING_MODES: BillingMode[] = ['beta', 'business'];
const REGISTRATION_MODES: RegistrationMode[] = ['open', 'closed'];

/**
 * Глобальные настройки портала. Живут в billing-модуле, потому что там же
 * лежит единственная строка AppSettings и режим биллинга — заводить ради двух
 * колонок отдельный модуль было бы дороже, чем польза.
 */
@Injectable()
export class PlatformSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly events: EventEmitter2,
  ) {}

  async read(): Promise<AdminPlatformSettings> {
    const settings = await this.prisma.appSettings.findUnique({
      where: { id: APP_SETTINGS_ID },
    });
    return {
      billingMode: settings?.billingMode ?? 'business',
      registrationMode: settings?.registrationMode ?? 'open',
      registrationNote: settings?.registrationNote ?? null,
      integrations: collectIntegrationStatuses((key) =>
        this.config.get<string>(key),
      ),
      updatedAt: settings?.updatedAt?.toISOString() ?? null,
    };
  }

  async update(
    adminId: string,
    body: AdminUpdatePlatformSettingsRequest,
  ): Promise<AdminPlatformSettings> {
    const data = normalizeSettings(body);
    if (Object.keys(data).length === 0) {
      throw new BadRequestException('Нечего обновлять');
    }

    const previous = await this.read();
    const updated = await this.prisma.appSettings.upsert({
      where: { id: APP_SETTINGS_ID },
      create: { id: APP_SETTINGS_ID, ...data },
      update: data,
    });

    // Два разных действия в журнале: режим биллинга меняет доступ всем сразу,
    // закрытая регистрация — только новым, и путать их при разборе не нужно.
    if (data.billingMode && data.billingMode !== previous.billingMode) {
      this.audit(adminId, 'billing.mode-changed', {
        from: previous.billingMode,
        to: data.billingMode,
      });
    }
    if (
      data.registrationMode &&
      data.registrationMode !== previous.registrationMode
    ) {
      this.audit(adminId, 'platform.registration-changed', {
        from: previous.registrationMode,
        to: data.registrationMode,
      });
    }

    return {
      billingMode: updated.billingMode,
      registrationMode: updated.registrationMode,
      registrationNote: updated.registrationNote,
      integrations: collectIntegrationStatuses((key) =>
        this.config.get<string>(key),
      ),
      updatedAt: updated.updatedAt.toISOString(),
    };
  }

  private audit(
    actorId: string,
    action: AdminAuditEvent['action'],
    details: AdminAuditEvent['details'],
  ): void {
    const event: AdminAuditEvent = {
      actorId,
      action,
      targetType: 'platform',
      details,
    };
    this.events.emit('admin.action', event);
  }
}

export interface NormalizedSettings {
  billingMode?: BillingMode;
  registrationMode?: RegistrationMode;
  registrationNote?: string | null;
}

/**
 * Разбор тела запроса. Отсутствующее поле значит «не менять»: правка режима
 * регистрации не должна сбрасывать режим биллинга.
 */
export function normalizeSettings(
  body: AdminUpdatePlatformSettingsRequest,
): NormalizedSettings {
  const data: NormalizedSettings = {};
  if (!body) return data;

  if (body.billingMode !== undefined) {
    if (!BILLING_MODES.includes(body.billingMode)) {
      throw new BadRequestException('Неизвестный режим биллинга');
    }
    data.billingMode = body.billingMode;
  }
  if (body.registrationMode !== undefined) {
    if (!REGISTRATION_MODES.includes(body.registrationMode)) {
      throw new BadRequestException('Неизвестный режим регистрации');
    }
    data.registrationMode = body.registrationMode;
  }
  if (body.registrationNote !== undefined) {
    const note = body.registrationNote?.trim() ?? '';
    if (note.length > REGISTRATION_NOTE_MAX_LENGTH) {
      throw new BadRequestException(
        `Текст отказа не длиннее ${REGISTRATION_NOTE_MAX_LENGTH} символов`,
      );
    }
    // Пустая строка — «убрать свой текст», а не сохранить пустоту: иначе
    // человеку при отказе показалось бы пустое сообщение.
    data.registrationNote = note || null;
  }
  return data;
}
