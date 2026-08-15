import { BadRequestException, Injectable } from '@nestjs/common';
import type {
  MarketCurrency,
  MarketLocale,
  MarketPreferencesDto,
  UpdateMarketPreferencesRequest,
} from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';

const LOCALES: MarketLocale[] = ['ru', 'en'];
const CURRENCIES: MarketCurrency[] = ['rub', 'usd', 'eur', 'inr'];

/** Отсутствие строки в базе означает значения по умолчанию — строку заводим
 *  только когда человек что-то поменял. */
const DEFAULTS: MarketPreferencesDto = {
  uiLanguage: 'ru',
  displayCurrency: 'rub',
  priceDropAlerts: true,
};

@Injectable()
export class MarketPreferencesService {
  constructor(private readonly prisma: PrismaService) {}

  async get(userId: string): Promise<MarketPreferencesDto> {
    const saved = await this.prisma.marketPreference.findUnique({
      where: { userId },
    });
    if (!saved) return { ...DEFAULTS };
    return {
      uiLanguage: (saved.uiLanguage as MarketLocale) ?? DEFAULTS.uiLanguage,
      displayCurrency: saved.displayCurrency,
      priceDropAlerts: saved.priceDropAlerts,
    };
  }

  async update(
    userId: string,
    body: UpdateMarketPreferencesRequest,
  ): Promise<MarketPreferencesDto> {
    if (body.uiLanguage !== undefined && !LOCALES.includes(body.uiLanguage)) {
      throw new BadRequestException('unsupported_language');
    }
    if (
      body.displayCurrency !== undefined &&
      !CURRENCIES.includes(body.displayCurrency)
    ) {
      throw new BadRequestException('unsupported_currency');
    }

    const current = await this.get(userId);
    const next: MarketPreferencesDto = {
      uiLanguage: body.uiLanguage ?? current.uiLanguage,
      displayCurrency: body.displayCurrency ?? current.displayCurrency,
      priceDropAlerts: body.priceDropAlerts ?? current.priceDropAlerts,
    };

    await this.prisma.marketPreference.upsert({
      where: { userId },
      update: next,
      create: { userId, ...next },
    });
    return next;
  }
}
