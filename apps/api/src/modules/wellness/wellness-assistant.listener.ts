import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import type {
  AssistantToolReply,
  AssistantToolRequest,
} from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { normalizeBarcode } from './barcode';

/**
 * Ассистент портала спрашивает «Здоровье» о продукте. Имя события дублируется
 * в каждом сервисе — модули не импортируют друг друга. Ответ самодостаточен:
 * название, состав и ссылка; ассистент чужих таблиц не читает.
 *
 * Вердикт здесь не считается: он зависит от ограничений конкретного человека,
 * а событие про них ничего не знает. Ассистент получает факт — состав.
 */
const WELLNESS_LOOKUP = 'assistant.tool.wellness_lookup';
const EXCERPT = 400;

@Injectable()
export class WellnessAssistantListener {
  constructor(private readonly prisma: PrismaService) {}

  @OnEvent(WELLNESS_LOOKUP)
  async lookup(request: AssistantToolRequest): Promise<AssistantToolReply> {
    const barcodeArg =
      typeof request.args.barcode === 'string' ? request.args.barcode : '';
    const query =
      typeof request.args.query === 'string' ? request.args.query.trim() : '';
    const barcode = barcodeArg ? normalizeBarcode(barcodeArg) : null;

    if (!barcode && !query) return { ok: true, items: [] };

    const rows = await this.prisma.wellnessProduct.findMany({
      where: {
        status: 'published',
        ...(barcode
          ? { barcode }
          : {
              OR: [
                { name: { contains: query, mode: 'insensitive' } },
                { brand: { contains: query, mode: 'insensitive' } },
              ],
            }),
      },
      orderBy: { createdAt: 'desc' },
      take: barcode ? 1 : 5,
      select: {
        barcode: true,
        name: true,
        brand: true,
        ingredientsRaw: true,
      },
    });

    return {
      ok: true,
      items: rows.map((row) => ({
        title: row.name,
        subtitle: row.brand,
        body: row.ingredientsRaw.slice(0, EXCERPT),
        href: `/wellness/products/${row.barcode}`,
      })),
    };
  }
}
