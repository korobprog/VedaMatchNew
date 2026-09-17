import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthProvider, DataResidency, Gender, User } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { canUnlink, decideLink } from './identity-link';
import { PersonalDataService } from '../personal-data/personal-data.service';
import { consentsAtRegistration } from '../personal-data/policy-version';

/** Строка списка «Аккаунт и способы входа» — без `externalId`: показывать
 *  наружу нечего, кроме факта привязки и когда ей пользовались в последний
 *  раз. */
export type IdentitySummary = {
  provider: AuthProvider;
  createdAt: Date;
  lastLoginAt: Date | null;
  canUnlink: boolean;
};

export type ProviderProfile = {
  provider: AuthProvider;
  externalId: string;
  email: string;
  name: string;
  avatarUrl?: string;
  gender?: Gender;
  /**
   * Резидентность, ЗАЯВЛЕННАЯ самим человеком. Обычно её нет: мы не
   * спрашиваем, а способ входа гражданства не устанавливает — у иностранца
   * бывает VK, у гражданина РФ почта на Google.
   *
   * Пусто — значит неизвестно, и тогда `ru`: при неопределённом гражданстве
   * данные хранятся в России. Правило появилось после правового разбора
   * 2026-09-04, до него признак ошибочно выводился из провайдера.
   */
  declaredResidency?: DataResidency;
  /** Адрес запроса — уходит в запись согласия, данного при регистрации. */
  requestIp?: string | null;
};

export type ResolveHooks = {
  /**
   * Вызывается ровно перед созданием нового аккаунта и только для него.
   * Через него обработчик входа держит закрытую регистрацию: уже заведённые
   * входят и при закрытой, отказ получает только новый.
   */
  beforeCreate?: () => Promise<void>;
};

@Injectable()
export class IdentityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly personal: PersonalDataService,
  ) {}

  /**
   * Ищет пользователя по паре «провайдер, идентификатор». Не находит — заводит.
   * Совпадение почты аккаунты НЕ связывает: иначе любой, кто заведёт у другого
   * провайдера ящик с чужим адресом, заберёт чужой аккаунт. Привязать второй
   * способ можно только из настроек живой сессией.
   */
  async resolve(
    profile: ProviderProfile,
    hooks: ResolveHooks = {},
  ): Promise<{ user: User; created: boolean }> {
    const existing = await this.prisma.userIdentity.findUnique({
      where: {
        provider_externalId: {
          provider: profile.provider,
          externalId: profile.externalId,
        },
      },
      include: { user: true },
    });

    if (existing) {
      await this.prisma.userIdentity.update({
        where: { id: existing.id },
        data: { lastLoginAt: new Date() },
      });
      return { user: existing.user, created: false };
    }

    const byEmail = await this.prisma.user.findUnique({
      where: { email: profile.email },
    });

    if (byEmail) {
      throw new ConflictException(
        'Этот адрес уже используется. Войдите прежним способом и привяжите новый в настройках.',
      );
    }

    await hooks.beforeCreate?.();

    // id задаётся явно: в российском контуре тот же идентификатор нужен
    // московской базе, и полагаться на @default(uuid()) со стороны Postgres
    // нельзя — он выдаст там своё значение.
    const id = randomUUID();

    // Неизвестно — значит Россия. Сомнение трактуется в пользу локализации,
    // а не в пользу удобства.
    const residency: DataResidency = profile.declaredResidency ?? 'ru';

    // Через PersonalDataService, а не напрямую: для россиянина запись обязана
    // сначала произойти в московской базе. Порядок здесь не деталь
    // реализации, а то, что делает схему законной.
    const user = await this.personal.write(
      {
        residency,
        record: {
          id,
          email: profile.email,
          name: profile.name,
          spiritualName: null,
          birthDate: null,
          gender: profile.gender ?? null,
          avatarKey: null,
          photoKeys: [],
        },
        // Согласие даётся ровно здесь: человек прошёл экран входа, где сказано
        // «Продолжая, вы принимаете условия использования и политику
        // конфиденциальности».
        consents: consentsAtRegistration(profile.requestIp),
      },
      () =>
        this.prisma.user.create({
          data: {
            id,
            email: profile.email,
            name: profile.name,
            avatarUrl: profile.avatarUrl,
            gender: profile.gender,
            // Проставляется здесь и дальше не меняется.
            dataResidency: residency,
            identities: {
              create: {
                provider: profile.provider,
                externalId: profile.externalId,
                lastLoginAt: new Date(),
              },
            },
          },
        }),
    );

    return { user, created: true };
  }

  /** Список способов входа для экрана «Аккаунт»: без `externalId`. */
  async listIdentities(userId: string): Promise<IdentitySummary[]> {
    const rows = await this.prisma.userIdentity.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
      select: { provider: true, createdAt: true, lastLoginAt: true },
    });
    return rows.map((row) => ({ ...row, canUnlink: canUnlink(rows.length) }));
  }

  /**
   * Привязка способа входа живой сессией (не вход): найденная свободная
   * идентичность заводится на `userId`, найденная на самом `userId` —
   * no-op, найденная на чужом — отказ. Почта пользователя не трогается —
   * в отличие от `resolve()`, это не создание аккаунта.
   */
  async link(
    userId: string,
    provider: AuthProvider,
    externalId: string,
  ): Promise<'created' | 'noop'> {
    const existing = await this.prisma.userIdentity.findUnique({
      where: { provider_externalId: { provider, externalId } },
    });
    const decision = decideLink(existing?.userId ?? null, userId);
    if (decision === 'conflict') {
      throw new ConflictException(
        'Этот способ входа уже привязан к другому аккаунту VedaMatch. Сначала отвяжите его там или войдите под тем аккаунтом.',
      );
    }
    if (decision === 'noop') {
      await this.prisma.userIdentity.update({
        where: { id: existing!.id },
        data: { lastLoginAt: new Date() },
      });
      return 'noop';
    }
    await this.prisma.userIdentity.create({
      data: { userId, provider, externalId, lastLoginAt: new Date() },
    });
    return 'created';
  }

  /**
   * Отвязка способа входа. Последний способ отвязать нельзя — аккаунт стал
   * бы недоступен никаким входом. `googleId` — устаревшая колонка `User`,
   * оставшаяся от входа до `UserIdentity`: гасится вместе с идентичностью,
   * иначе она продолжала бы молча пускать через старый путь.
   */
  async unlink(userId: string, provider: AuthProvider): Promise<void> {
    const rows = await this.prisma.userIdentity.findMany({
      where: { userId },
      select: { id: true, provider: true },
    });
    if (!canUnlink(rows.length)) {
      throw new ConflictException(
        'Это последний способ входа — отвязать его нельзя, иначе аккаунт станет недоступен. Сначала привяжите другой.',
      );
    }
    const target = rows.find((row) => row.provider === provider);
    if (!target) {
      throw new NotFoundException('Этот способ входа не привязан к аккаунту.');
    }
    await this.prisma.userIdentity.delete({ where: { id: target.id } });
    if (provider === 'google') {
      await this.prisma.user.updateMany({
        where: { id: userId, googleId: { not: null } },
        data: { googleId: null },
      });
    }
  }
}
