import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import type { Prisma } from '@prisma/client';
import type {
  AssistantToolReply,
  AssistantToolRequest,
} from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { normalizeCityKey } from '../../common/city-key';
import { formatPriceMinor } from './market-price';

/**
 * Ассистент портала спрашивает Рынок о товарах и услугах. Имя события
 * дублируется в каждом сервисе — модули не импортируют друг друга. Ответ
 * самодостаточен: заголовок, цена, фото и ссылка — ассистент чужих таблиц
 * не читает.
 */
const MARKET_SEARCH = 'assistant.tool.market_search';
const EXCERPT = 160;

@Injectable()
export class MarketAssistantListener {
  constructor(private readonly prisma: PrismaService) {}

  @OnEvent(MARKET_SEARCH)
  async search(request: AssistantToolRequest): Promise<AssistantToolReply> {
    const query = textArg(request.args.query);
    const limit = Math.min(8, Math.max(1, Number(request.args.limit) || 5));
    const kind =
      request.args.kind === 'product' || request.args.kind === 'service'
        ? request.args.kind
        : undefined;
    const city =
      typeof request.args.city === 'string' && request.args.city.trim()
        ? normalizeCityKey(request.args.city)
        : undefined;
    if (!query) return { ok: true, items: [] };

    const words = query.split(/\s+/).filter(Boolean).slice(0, 5);
    const textMatch = (word: string): Prisma.MarketListingWhereInput => ({
      OR: [
        { titleRu: { contains: word, mode: 'insensitive' } },
        { titleEn: { contains: word, mode: 'insensitive' } },
        { descriptionRu: { contains: word, mode: 'insensitive' } },
        { descriptionEn: { contains: word, mode: 'insensitive' } },
        { shop: { name: { contains: word, mode: 'insensitive' } } },
      ],
    });
    const where: Prisma.MarketListingWhereInput = {
      status: 'published',
      shop: { status: 'active' },
      ...(kind ? { kind } : {}),
      ...(city ? { cityKey: city } : {}),
      AND: words.map(textMatch),
    };
    const rows = await this.prisma.marketListing.findMany({
      where,
      orderBy: [{ favoritesCount: 'desc' }, { publishedAt: 'desc' }],
      take: limit,
      select: {
        id: true,
        kind: true,
        titleRu: true,
        titleEn: true,
        descriptionRu: true,
        descriptionEn: true,
        priceMode: true,
        priceMinor: true,
        currency: true,
        city: true,
        primaryImageUrl: true,
        shop: { select: { name: true } },
      },
    });
    return {
      ok: true,
      items: rows.map((row) => ({
        title: row.titleRu || row.titleEn || 'Без названия',
        subtitle: [
          priceLabel(row),
          row.shop.name,
          row.city,
          row.kind === 'service' ? 'услуга' : 'товар',
        ]
          .filter(Boolean)
          .join(' · '),
        body: excerpt(row.descriptionRu || row.descriptionEn),
        imageUrl: row.primaryImageUrl,
        href: `/market/listing/${row.id}`,
      })),
    };
  }
}

/** Аргумент модели как строка: всё, что не строка, — пусто. */
function textArg(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function priceLabel(row: {
  priceMode: 'fixed' | 'from' | 'negotiable' | 'free';
  priceMinor: number | null;
  currency: 'rub' | 'usd' | 'eur' | 'inr';
}): string {
  if (row.priceMode === 'free') return 'бесплатно';
  if (row.priceMode === 'negotiable' || row.priceMinor == null)
    return 'цена договорная';
  const price = formatPriceMinor(row.priceMinor, row.currency);
  return row.priceMode === 'from' ? `от ${price}` : price;
}

function excerpt(text: string | null): string | null {
  if (!text) return null;
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > EXCERPT ? `${flat.slice(0, EXCERPT - 1)}…` : flat;
}
