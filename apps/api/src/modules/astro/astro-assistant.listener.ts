import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import type {
  AssistantToolReply,
  AssistantToolRequest,
} from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Ассистент портала спрашивает Астрологию, что у человека уже есть. Имя
 * события дублируется в каждом сервисе — модули не импортируют друг друга.
 * Наружу уходит только факт «данные заполнены» и ссылки: сама карта и
 * разборы — по ссылке, в сервисе.
 */
const ASTRO_STATUS = 'assistant.tool.astro_status';

@Injectable()
export class AstroAssistantListener {
  constructor(private readonly prisma: PrismaService) {}

  @OnEvent(ASTRO_STATUS)
  async status(request: AssistantToolRequest): Promise<AssistantToolReply> {
    const birth = await this.prisma.astroBirthData.findUnique({
      where: { userId: request.userId },
      select: { timeAccuracy: true, placeLabel: true },
    });
    if (!birth)
      return {
        ok: true,
        text: 'Данные рождения ещё не заполнены: карта и разборы появятся после заполнения.',
        items: [
          {
            title: 'Заполнить данные рождения',
            subtitle: 'Астрология',
            body: 'Дата, время и место рождения — и сервис построит ведическую карту.',
            href: '/astro',
          },
        ],
      };
    const exact = birth.timeAccuracy === 'exact';
    return {
      ok: true,
      text: `Данные рождения заполнены (${birth.placeLabel}${exact ? '' : ', время приблизительное'}). Карта, разборы и совместимость доступны в сервисе.`,
      items: [
        {
          title: 'Моя карта рождения',
          subtitle: 'Астрология',
          body: 'Ведическая карта с разборами по разделам.',
          href: '/astro/chart',
        },
        {
          title: 'Совместимость',
          subtitle: 'Астрология',
          body: 'Гуна-милан: сравнение по звёздам с другим человеком.',
          href: '/astro/compatibility',
        },
      ],
    };
  }
}
