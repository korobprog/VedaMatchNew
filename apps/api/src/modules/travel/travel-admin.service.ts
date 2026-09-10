import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AdminTravelStayDto, TravelPlaceDto } from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { stayCardSelect, toStayCard } from './travel.service';

/**
 * Слаг точки на карте: латиницей, из названия. Транслитерация продублирована
 * внутри модуля — контракт запрещает тянуть хелпер чужого сервиса.
 */
const TRANSLIT: Record<string, string> = {
  а: 'a',
  б: 'b',
  в: 'v',
  г: 'g',
  д: 'd',
  е: 'e',
  ё: 'e',
  ж: 'zh',
  з: 'z',
  и: 'i',
  й: 'y',
  к: 'k',
  л: 'l',
  м: 'm',
  н: 'n',
  о: 'o',
  п: 'p',
  р: 'r',
  с: 's',
  т: 't',
  у: 'u',
  ф: 'f',
  х: 'h',
  ц: 'ts',
  ч: 'ch',
  ш: 'sh',
  щ: 'sch',
  ъ: '',
  ы: 'y',
  ь: '',
  э: 'e',
  ю: 'yu',
  я: 'ya',
};

/**
 * Значение поля формы как строка. `String(unknown)` на объекте даёт
 * «[object Object]», и такое название точки уехало бы на карту.
 */
function asText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function placeSlug(name: string): string {
  const slug = [...name.toLowerCase()]
    .map((char) => TRANSLIT[char] ?? char)
    .join('')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'place';
}

@Injectable()
export class TravelAdminService {
  constructor(private readonly prisma: PrismaService) {}

  async places(): Promise<{ items: TravelPlaceDto[] }> {
    const rows = await this.prisma.travelPlace.findMany({
      orderBy: [{ country: 'asc' }, { name: 'asc' }],
      include: { _count: { select: { stays: true } } },
    });
    return {
      items: rows.map((row) => ({
        id: row.id,
        slug: row.slug,
        name: row.name,
        country: row.country,
        region: row.region,
        lat: row.lat,
        lng: row.lng,
        summary: row.summary,
        stayCount: row._count.stays,
      })),
    };
  }

  async createPlace(body: Record<string, unknown>): Promise<{ id: string }> {
    const name = asText(body.name);
    const country = asText(body.country);
    if (!name || !country) {
      throw new BadRequestException('У точки должны быть название и страна');
    }
    const lat = Number(body.lat);
    const lng = Number(body.lng);
    if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
      throw new BadRequestException('Широта вне допустимых значений');
    }
    if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
      throw new BadRequestException('Долгота вне допустимых значений');
    }

    return this.prisma.travelPlace.create({
      data: {
        slug: await this.freeSlug(placeSlug(name)),
        name,
        country,
        region: asText(body.region) || null,
        lat,
        lng,
        summary: asText(body.summary),
      },
      select: { id: true },
    });
  }

  async removePlace(id: string): Promise<void> {
    const place = await this.prisma.travelPlace.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!place) throw new NotFoundException('Точка не найдена');
    // Объекты остаются с placeId = null (SetNull в схеме): уборка карты не
    // должна уносить с собой хостел.
    await this.prisma.travelPlace.delete({ where: { id } });
  }

  /** Все объекты, включая черновики и снятые: это экран модерации. */
  async stays(): Promise<{ items: AdminTravelStayDto[] }> {
    const rows = await this.prisma.travelStay.findMany({
      select: { ...stayCardSelect, status: true },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
    return {
      items: rows.map((row) => ({ ...toStayCard(row), status: row.status })),
    };
  }

  /**
   * Снять объект или вернуть его хозяину. `removed_by_admin` хозяин сам не
   * снимет — иначе решение администрации отменялось бы одной кнопкой.
   */
  async setStayStatus(
    id: string,
    status: 'removed_by_admin' | 'published' | 'draft',
  ): Promise<AdminTravelStayDto> {
    const stay = await this.prisma.travelStay.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!stay) throw new NotFoundException('Объект не найден');
    const row = await this.prisma.travelStay.update({
      where: { id },
      data: { status },
      select: { ...stayCardSelect, status: true },
    });
    return { ...toStayCard(row), status: row.status };
  }

  private async freeSlug(base: string): Promise<string> {
    for (let suffix = 0; suffix < 50; suffix += 1) {
      const slug = suffix ? `${base}-${suffix + 1}` : base;
      const taken = await this.prisma.travelPlace.findUnique({
        where: { slug },
        select: { id: true },
      });
      if (!taken) return slug;
    }
    throw new BadRequestException('Слишком много точек с таким названием');
  }
}
