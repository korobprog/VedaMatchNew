import { ConflictException, Injectable } from '@nestjs/common';
import type { AuthProvider, Gender, User } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { PersonalDataService } from '../personal-data/personal-data.service';

export type ProviderProfile = {
  provider: AuthProvider;
  externalId: string;
  email: string;
  name: string;
  avatarUrl?: string;
  gender?: Gender;
  residency: 'ru' | 'global';
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

    // Через PersonalDataService, а не напрямую: для россиянина запись обязана
    // сначала произойти в московской базе. Порядок здесь не деталь
    // реализации, а то, что делает схему законной.
    const user = await this.personal.write(
      {
        residency: profile.residency,
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
      },
      () =>
        this.prisma.user.create({
          data: {
            id,
            email: profile.email,
            name: profile.name,
            avatarUrl: profile.avatarUrl,
            gender: profile.gender,
            // Проставляется здесь и больше не меняется. У входа по почте
            // признак задним числом невосстановим: правило смотрит на домен
            // регистрации, а его не помнят ни адрес, ни идентичность.
            dataResidency: profile.residency,
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
}
