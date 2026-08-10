import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  ASTRO_SECTIONS,
  ASTRO_SECTION_TITLES,
  type AstroReadingsDto,
  type AstroSection,
  type AstroSectionState,
  type VedicChart,
} from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { AstroChartService } from './astro-chart.service';
import {
  AstroGenerationService,
  ASTRO_PROMPT_VERSION,
} from './astro-generation.service';
import { AstroQuotaService } from './astro-quota.service';
import { AstroSettingsService } from './astro-settings.service';
import { missingFor } from './astro-sections';

const DEFAULT_LOCALE = 'ru';

/**
 * Разборы карты: кэш, квоты и генерация в одном месте.
 *
 * Порядок проверок важен и именно такой: сначала кэш, потом доступность раздела,
 * потом бюджет и квота, и только затем провайдер. Каждый следующий шаг дороже
 * предыдущего, а самый дорогой — последний.
 */
@Injectable()
export class AstroReadingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly charts: AstroChartService,
    private readonly generation: AstroGenerationService,
    private readonly quota: AstroQuotaService,
    private readonly settings: AstroSettingsService,
  ) {}

  async list(
    userId: string,
    locale = DEFAULT_LOCALE,
    now: Date = new Date(),
  ): Promise<AstroReadingsDto> {
    await this.assertServiceEnabled();
    const chart = await this.charts.chart(userId, now);
    const [cached, quota] = await Promise.all([
      this.cachedTexts(chart.fingerprint, locale),
      this.quota.state(userId, now),
    ]);

    const sections = ASTRO_SECTIONS.map((section) =>
      this.sectionState(section, chart, cached, quota),
    );

    return { sections, quota };
  }

  async generate(
    userId: string,
    section: AstroSection,
    locale = DEFAULT_LOCALE,
    now: Date = new Date(),
  ): Promise<AstroSectionState> {
    await this.assertServiceEnabled();
    if (!ASTRO_SECTIONS.includes(section)) {
      throw new BadRequestException('Неизвестный раздел разбора');
    }

    const chart = await this.charts.chart(userId, now);

    // Кэш проверяется до всего остального: готовый текст не стоит ничего и не
    // должен списывать квоту, даже если она уже исчерпана.
    const cached = await this.cachedTexts(chart.fingerprint, locale);
    const existing = cached.get(section);
    if (existing) {
      return this.sectionState(
        section,
        chart,
        cached,
        await this.quota.state(userId, now),
      );
    }

    const missing = missingFor(section, chart);
    if (missing.length > 0) {
      throw new BadRequestException(
        'Для этого раздела не хватает данных рождения',
      );
    }

    const decision = await this.quota.check(userId, now);
    if (!decision.allowed) {
      if (decision.reason === 'ai_unavailable') {
        throw new ServiceUnavailableException(
          'Генерация разборов временно недоступна; карта и расчёты работают',
        );
      }
      throw new ForbiddenException('Дневная квота разборов исчерпана');
    }

    const generated = await this.generation.generate(section, chart, locale);

    await this.prisma.astroReading.upsert({
      where: {
        chartFingerprint_section_locale_promptVersion: {
          chartFingerprint: chart.fingerprint,
          section,
          locale,
          promptVersion: ASTRO_PROMPT_VERSION,
        },
      },
      create: {
        chartFingerprint: chart.fingerprint,
        section,
        locale,
        promptVersion: ASTRO_PROMPT_VERSION,
        text: generated.text,
        model: generated.model,
        tokensIn: generated.tokensIn,
        tokensOut: generated.tokensOut,
      },
      update: {
        text: generated.text,
        model: generated.model,
        tokensIn: generated.tokensIn,
        tokensOut: generated.tokensOut,
      },
    });

    // Расход записывается по факту ответа: списывать надо потраченное.
    await this.quota.record(
      userId,
      { tokensIn: generated.tokensIn, tokensOut: generated.tokensOut },
      now,
    );

    cached.set(section, generated.text);
    return this.sectionState(
      section,
      chart,
      cached,
      await this.quota.state(userId, now),
    );
  }

  private async assertServiceEnabled(): Promise<void> {
    const settings = await this.settings.get();
    if (!settings.enabled) {
      throw new ServiceUnavailableException('Сервис астрологии отключён');
    }
  }

  private async cachedTexts(
    fingerprint: string,
    locale: string,
  ): Promise<Map<AstroSection, string>> {
    const rows = await this.prisma.astroReading.findMany({
      where: {
        chartFingerprint: fingerprint,
        locale,
        promptVersion: ASTRO_PROMPT_VERSION,
      },
      select: { section: true, text: true },
    });
    return new Map(rows.map((row) => [row.section, row.text]));
  }

  private sectionState(
    section: AstroSection,
    chart: VedicChart,
    cached: Map<AstroSection, string>,
    quota: { readingsLeft: number; aiAvailable: boolean },
  ): AstroSectionState {
    const text = cached.get(section) ?? null;
    const missing = missingFor(section, chart);

    // Уже сгенерированный раздел доступен всегда: он лежит в кэше и не стоит
    // ничего. Квота и выключатель ограничивают появление НОВЫХ текстов.
    const blockedBy = text
      ? null
      : missing.length > 0
        ? ('requires_data' as const)
        : !quota.aiAvailable
          ? ('ai_unavailable' as const)
          : quota.readingsLeft <= 0
            ? ('quota_exhausted' as const)
            : null;

    return {
      section,
      title: ASTRO_SECTION_TITLES[section],
      text,
      available: blockedBy === null,
      blockedBy,
      requires: missing,
    };
  }
}
