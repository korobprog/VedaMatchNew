import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  resolveDisplayName,
  type AccessTokenPayload,
  type TravelMapGuideDto,
} from '@vedamatch/shared';
import { PrismaService } from '../../../prisma/prisma.service';
import { parseGuideInput } from './guide-input';

const GUIDES_LIMIT = 200;

// Имя наружу собирает resolveDisplayName, поэтому `spiritualName` тянем всегда.
const guideInclude = {
  user: {
    select: { id: true, name: true, spiritualName: true, isAgent: true },
  },
} as const;
type GuideRow = Prisma.TravelMapGuideGetPayload<{
  include: typeof guideInclude;
}>;

interface Counts {
  done: number;
  upcoming: number;
}

function toDto(row: GuideRow, counts: Counts | undefined): TravelMapGuideDto {
  return {
    userId: row.userId,
    name: resolveDisplayName(row.user),
    isAgent: row.user.isAgent,
    about: row.about,
    languages: row.languages,
    cities: row.cities,
    telegram: row.telegram,
    phone: row.phone,
    toursDone: counts?.done ?? 0,
    toursUpcoming: counts?.upcoming ?? 0,
    createdAt: row.createdAt.toISOString(),
  };
}

@Injectable()
export class TravelMapGuidesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Счётчики наборов по гидам одним groupBy: гидов немного, но N запросов ни к чему. */
  private async countsFor(userIds: string[]): Promise<Map<string, Counts>> {
    const result = new Map<string, Counts>();
    if (userIds.length === 0) return result;
    const groups = await this.prisma.travelMapTour.groupBy({
      by: ['guideId', 'status'],
      where: {
        guideId: { in: userIds },
        // «Предстоящий» — открытый и ещё не прошедший; просроченный без
        // отметки «прошла» не считаем ни там, ни там.
        OR: [
          { status: 'done' },
          { status: 'scheduled', startsAt: { gte: new Date() } },
        ],
      },
      _count: { _all: true },
    });
    for (const group of groups) {
      const entry = result.get(group.guideId) ?? { done: 0, upcoming: 0 };
      if (group.status === 'done') entry.done = group._count._all;
      else entry.upcoming = group._count._all;
      result.set(group.guideId, entry);
    }
    return result;
  }

  async list(): Promise<TravelMapGuideDto[]> {
    const rows = await this.prisma.travelMapGuide.findMany({
      include: guideInclude,
      orderBy: { createdAt: 'asc' },
      take: GUIDES_LIMIT,
    });
    const counts = await this.countsFor(rows.map((row) => row.userId));
    return rows.map((row) => toDto(row, counts.get(row.userId)));
  }

  async get(userId: string): Promise<TravelMapGuideDto> {
    const row = await this.prisma.travelMapGuide.findUnique({
      where: { userId },
      include: guideInclude,
    });
    if (!row) throw new NotFoundException('Экскурсовод не найден');
    const counts = await this.countsFor([userId]);
    return toDto(row, counts.get(userId));
  }

  async me(viewer: AccessTokenPayload): Promise<TravelMapGuideDto | null> {
    const row = await this.prisma.travelMapGuide.findUnique({
      where: { userId: viewer.sub },
      include: guideInclude,
    });
    if (!row) return null;
    const counts = await this.countsFor([viewer.sub]);
    return toDto(row, counts.get(viewer.sub));
  }

  async upsertMe(
    viewer: AccessTokenPayload,
    body: unknown,
  ): Promise<TravelMapGuideDto> {
    const fields = parseGuideInput(body);
    await this.prisma.travelMapGuide.upsert({
      where: { userId: viewer.sub },
      create: { userId: viewer.sub, ...fields },
      update: fields,
    });
    return this.get(viewer.sub);
  }

  /** Профиль удаляется; наборы уходят каскадом по гиду только вместе с аккаунтом, поэтому не трогаем. */
  async removeMe(viewer: AccessTokenPayload): Promise<void> {
    await this.prisma.travelMapGuide.deleteMany({
      where: { userId: viewer.sub },
    });
  }
}
