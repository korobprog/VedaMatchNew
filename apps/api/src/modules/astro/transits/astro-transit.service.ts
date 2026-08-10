import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { AstroTodayDto } from '@vedamatch/shared';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  AstroGenerationService,
  ASTRO_PROMPT_VERSION,
} from '../astro-generation.service';
import { AstroQuotaService } from '../astro-quota.service';
import type { EphemerisProvider } from '../ephemeris/ephemeris-provider';
import { EPHEMERIS_PROVIDER } from '../ephemeris/ephemeris.token';
import { buildVedicChart } from '../vedic/vedic-chart';
import { computeTransitFacts, transitPatternKey } from './transit-facts';

const DEFAULT_LOCALE = 'ru';

/**
 * Персональный день. Факты бесплатны и считаются всегда; фраза — общая на весь
 * портал по бхаве транзитной Луны (см. transit-facts.ts) и кэшируется отдельно
 * от факта конкретного человека, поэтому расход на неё не персональный.
 */
@Injectable()
export class AstroTransitService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(EPHEMERIS_PROVIDER) private readonly ephemeris: EphemerisProvider,
    private readonly generation: AstroGenerationService,
    private readonly quota: AstroQuotaService,
  ) {}

  /**
   * null — у человека нет данных рождения или неизвестно время: бхава транзита
   * без натальной лагны не определена, показывать её было бы вымыслом.
   */
  async today(
    userId: string,
    now: Date = new Date(),
    locale = DEFAULT_LOCALE,
  ): Promise<AstroTodayDto | null> {
    const birth = await this.prisma.astroBirthData.findUnique({
      where: { userId },
    });
    if (!birth || birth.timeAccuracy === 'unknown') return null;

    const chart = buildVedicChart(this.ephemeris, {
      bornAtUtc: birth.bornAtUtc,
      latitude: birth.latitude,
      longitude: birth.longitude,
      timeAccuracy: birth.timeAccuracy,
      now,
    });
    if (!chart.lagna || !chart.dasha) return null;

    const facts = computeTransitFacts(this.ephemeris, now, chart.lagna.rashi);
    const text = await this.phraseFor(facts.moonBhava, locale, now);
    const forDate = dayKey(now);
    // TransitFacts — плоский объект из чисел, но Prisma требует явно
    // подтверждённой JSON-совместимости, а не структурного совпадения.
    const data = facts as unknown as Prisma.InputJsonValue;

    await this.prisma.astroTransitDigest.upsert({
      where: { userId_forDate: { userId, forDate } },
      create: { userId, forDate, data, text },
      update: { data, text },
    });

    return {
      forDate: forDate.toISOString().slice(0, 10),
      moonBhava: facts.moonBhava,
      moonRashi: facts.moonRashi,
      moonNakshatra: facts.moonNakshatra,
      currentMahadasha: { lord: chart.dasha.currentMahadasha.lord },
      currentAntardasha: { lord: chart.dasha.currentAntardasha.lord },
      text,
    };
  }

  /**
   * Кэш общий на весь портал, поэтому обращение к провайдеру происходит не
   * чаще, чем появляется новая бхава, которую ещё никто сегодня не запросил —
   * максимум 12 раз в сутки независимо от числа пользователей.
   */
  private async phraseFor(
    bhava: number,
    locale: string,
    now: Date,
  ): Promise<string | null> {
    const patternKey = transitPatternKey({ moonBhava: bhava });
    const cached = await this.prisma.astroTransitPhrase.findUnique({
      where: {
        patternKey_locale_promptVersion: {
          patternKey,
          locale,
          promptVersion: ASTRO_PROMPT_VERSION,
        },
      },
    });
    if (cached) return cached.text;

    if (!(await this.quota.aiAvailable(now))) return null;

    try {
      const generated = await this.generation.generateTransitPhrase(
        bhava,
        locale,
      );
      await this.prisma.astroTransitPhrase.upsert({
        where: {
          patternKey_locale_promptVersion: {
            patternKey,
            locale,
            promptVersion: ASTRO_PROMPT_VERSION,
          },
        },
        create: {
          patternKey,
          locale,
          promptVersion: ASTRO_PROMPT_VERSION,
          text: generated.text,
        },
        update: { text: generated.text },
      });
      await this.quota.recordSystemUsage(
        { tokensIn: generated.tokensIn, tokensOut: generated.tokensOut },
        now,
      );
      return generated.text;
    } catch {
      // Факты дня остаются достоверными и без фразы; провайдер попробует
      // снова при следующем обращении — неудачный ответ в кэш не пишется.
      return null;
    }
  }
}

/** Календарный день в UTC, как и usageDay в AstroQuotaService. */
function dayKey(now: Date): Date {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}
