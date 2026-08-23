import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { REWARDS_CODE_BYTES, generateReferralCode } from './rewards-code';

/** Сколько раз пробовать новый код при коллизии, прежде чем сдаться. */
const CODE_ATTEMPTS = 5;

/**
 * Реферальный счёт человека: собственный код и отпечатки регистрации.
 * Заводится лениво — при первом открытии экрана баллов или при регистрации
 * по чужой ссылке, — чтобы не плодить строки на аккаунты, которым программа
 * неинтересна.
 */
@Injectable()
export class RewardsAccountsService {
  private readonly logger = new Logger(RewardsAccountsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  private get webOrigin(): string {
    return this.config.get<string>('WEB_ORIGIN', 'http://localhost:3000');
  }

  /** Ссылка на лендинг с кодом. Собирается здесь, чтобы веб её не выдумывал. */
  referralLink(code: string): string {
    return `${this.webOrigin}/?ref=${code}`;
  }

  /**
   * Счёт человека; создаёт, если его ещё нет.
   *
   * Коллизия кода обрабатывается повтором, а не заранее вычисленной
   * уникальностью: проверка «есть ли такой» и вставка — не атомарная пара,
   * и параллельная регистрация всё равно упёрлась бы в уникальный индекс.
   */
  async ensure(
    userId: string,
    signals?: { ip?: string | null; deviceId?: string | null },
  ) {
    const existing = await this.prisma.rewardsAccount.findUnique({
      where: { userId },
    });
    if (existing) {
      // Отпечатки пишутся один раз — при регистрации. Перезапись на каждом
      // входе стёрла бы то, с чем антифрод сравнивает приглашённых.
      if (
        signals &&
        !existing.signupIp &&
        !existing.signupDeviceId &&
        (signals.ip || signals.deviceId)
      ) {
        return this.prisma.rewardsAccount.update({
          where: { userId },
          data: {
            signupIp: signals.ip ?? null,
            signupDeviceId: signals.deviceId ?? null,
          },
        });
      }
      return existing;
    }

    for (let attempt = 0; attempt < CODE_ATTEMPTS; attempt += 1) {
      const code = generateReferralCode(randomBytes(REWARDS_CODE_BYTES));
      try {
        return await this.prisma.rewardsAccount.create({
          data: {
            userId,
            code,
            signupIp: signals?.ip ?? null,
            signupDeviceId: signals?.deviceId ?? null,
          },
        });
      } catch {
        // Уникальный индекс мог сработать и по коду, и по userId: во втором
        // случае счёт уже завели параллельно, и он нам подходит.
        const raced = await this.prisma.rewardsAccount.findUnique({
          where: { userId },
        });
        if (raced) return raced;
      }
    }
    throw new Error(
      `Не удалось подобрать реферальный код для ${userId} за ${CODE_ATTEMPTS} попыток`,
    );
  }

  /** Кому принадлежит код. `null` — код неизвестен. */
  async findOwnerByCode(code: string): Promise<string | null> {
    const account = await this.prisma.rewardsAccount.findUnique({
      where: { code },
      select: { userId: true },
    });
    return account?.userId ?? null;
  }
}
