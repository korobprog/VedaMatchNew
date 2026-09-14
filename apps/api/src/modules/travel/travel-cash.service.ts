import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  resolveDisplayName,
  type TravelCashCategoriesResponse,
  type TravelCashCategoryDto,
  type TravelCashEntriesResponse,
  type TravelCashEntryDto,
  type TravelCashIcon,
  type TravelGuestColor,
} from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { cashBalance, DEFAULT_CASH_CATEGORIES } from './cash-book';
import {
  cashFiltersWhere,
  hasCashFilters,
  parseCashFilters,
  parseEntryIds,
} from './cash-filters';
import {
  CashInputError,
  parseCashCategoryInput,
  parseCashEntryInput,
  parseCashRange,
  parseOpeningMinor,
} from './cash-input';
import { parseEntryGuest } from './guest-input';
import { formatStayDate } from './travel-dates';

/**
 * Предел записей в одном ответе ленты. Хостел вносит десятки строк в день, и
 * три года годовой группировки в него укладываются; дальше — сужать период.
 */
const MAX_ENTRIES_PER_RESPONSE = 5000;

const entrySelect = {
  id: true,
  kind: true,
  amountMinor: true,
  occurredOn: true,
  categoryId: true,
  note: true,
  tags: true,
  createdAt: true,
  author: { select: { name: true, spiritualName: true } },
  guestId: true,
  nights: true,
  guest: { select: { fullName: true, color: true } },
} satisfies Prisma.TravelCashEntrySelect;

type EntryRow = Prisma.TravelCashEntryGetPayload<{
  select: typeof entrySelect;
}>;

function toEntryDto(row: EntryRow): TravelCashEntryDto {
  return {
    id: row.id,
    kind: row.kind,
    amountMinor: row.amountMinor,
    occurredOn: formatStayDate(row.occurredOn),
    categoryId: row.categoryId,
    note: row.note,
    tags: row.tags,
    authorName: row.author ? resolveDisplayName(row.author) : null,
    createdAt: row.createdAt.toISOString(),
    guestId: row.guestId,
    guestName: row.guest?.fullName ?? null,
    guestColor: (row.guest?.color as TravelGuestColor | undefined) ?? null,
    nights: row.nights,
  };
}

const categorySelect = {
  id: true,
  kind: true,
  name: true,
  icon: true,
  position: true,
} satisfies Prisma.TravelCashCategorySelect;

function toCategoryDto(
  row: Prisma.TravelCashCategoryGetPayload<{ select: typeof categorySelect }>,
): TravelCashCategoryDto {
  return { ...row, icon: row.icon as TravelCashIcon };
}

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  );
}

/**
 * Касса объекта: доходы и расходы хостела. Доступ — у всех управляющих
 * объекта, как и к заявкам: касса у хостела одна на всех, кто стоит на
 * ресепшене.
 */
@Injectable()
export class TravelCashService {
  constructor(private readonly prisma: PrismaService) {}

  async categories(
    userId: string,
    stayId: string,
  ): Promise<TravelCashCategoriesResponse> {
    await this.assertManager(userId, stayId);
    let rows = await this.listCategories(stayId);
    if (rows.length === 0) {
      // Первое открытие кассы. `skipDuplicates` держит гонку двух вкладок:
      // вторая вставка упрётся в уникальный индекс и молча пропустится.
      await this.prisma.travelCashCategory.createMany({
        data: DEFAULT_CASH_CATEGORIES.map((category, position) => ({
          ...category,
          stayId,
          position,
        })),
        skipDuplicates: true,
      });
      rows = await this.listCategories(stayId);
    }
    return { items: rows.map(toCategoryDto) };
  }

  async createCategory(
    userId: string,
    stayId: string,
    body: Record<string, unknown>,
  ): Promise<TravelCashCategoryDto> {
    await this.assertManager(userId, stayId);
    const input = this.parse(() => parseCashCategoryInput(body));
    const last = await this.prisma.travelCashCategory.aggregate({
      where: { stayId, kind: input.kind },
      _max: { position: true },
    });
    try {
      const row = await this.prisma.travelCashCategory.create({
        data: { ...input, stayId, position: (last._max.position ?? -1) + 1 },
        select: categorySelect,
      });
      return toCategoryDto(row);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new BadRequestException('Такая статья уже есть');
      }
      throw error;
    }
  }

  async updateCategory(
    userId: string,
    stayId: string,
    categoryId: string,
    body: Record<string, unknown>,
  ): Promise<TravelCashCategoryDto> {
    await this.assertManager(userId, stayId);
    const existing = await this.findCategory(stayId, categoryId);
    // Вид статьи не меняется: иначе все её записи молча перевернули бы знак.
    const input = this.parse(() =>
      parseCashCategoryInput({ ...body, kind: existing.kind }),
    );
    try {
      const row = await this.prisma.travelCashCategory.update({
        where: { id: categoryId },
        data: { name: input.name, icon: input.icon },
        select: categorySelect,
      });
      return toCategoryDto(row);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new BadRequestException('Такая статья уже есть');
      }
      throw error;
    }
  }

  async removeCategory(
    userId: string,
    stayId: string,
    categoryId: string,
  ): Promise<void> {
    await this.assertManager(userId, stayId);
    await this.findCategory(stayId, categoryId);
    // Записи остаются без статьи (SetNull в схеме): деньги из истории не
    // исчезают вместе со справочником.
    await this.prisma.travelCashCategory.delete({ where: { id: categoryId } });
  }

  async entries(
    userId: string,
    stayId: string,
    query: Record<string, unknown>,
  ): Promise<TravelCashEntriesResponse> {
    const stay = await this.prisma.travelStay.findFirst({
      where: { id: stayId, managers: { some: { userId } } },
      select: {
        name: true,
        currency: true,
        cashOpeningMinor: true,
        priceMinor: true,
      },
    });
    if (!stay) throw new NotFoundException('Объект не найден');

    const { from, to } = this.parse(() =>
      parseCashRange(query.from, query.to, new Date()),
    );
    const filters = this.parse(() => parseCashFilters(query));

    const [rows, before, total] = await Promise.all([
      this.prisma.travelCashEntry.findMany({
        where: {
          ...cashFiltersWhere(filters),
          stayId,
          occurredOn: { gte: from, lte: to },
        },
        select: entrySelect,
        orderBy: [{ occurredOn: 'desc' }, { createdAt: 'desc' }],
        take: MAX_ENTRIES_PER_RESPONSE + 1,
      }),
      this.sumsByKind({ stayId, occurredOn: { lt: from } }),
      this.sumsByKind({ stayId }),
    ]);

    if (rows.length > MAX_ENTRIES_PER_RESPONSE) {
      throw new BadRequestException(
        'За этот период слишком много записей — выберите период короче',
      );
    }

    return {
      stayName: stay.name,
      currency: stay.currency,
      openingMinor: stay.cashOpeningMinor,
      balanceBeforeMinor: cashBalance(stay.cashOpeningMinor, before),
      balanceMinor: cashBalance(stay.cashOpeningMinor, total),
      from: formatStayDate(from),
      to: formatStayDate(to),
      nightPriceMinor: stay.priceMinor,
      filtered: hasCashFilters(filters),
      items: rows.map(toEntryDto),
    };
  }

  async createEntry(
    userId: string,
    stayId: string,
    body: Record<string, unknown>,
  ): Promise<TravelCashEntryDto> {
    await this.assertManager(userId, stayId);
    const input = this.parse(() => parseCashEntryInput(body));
    const guest = this.parse(() => parseEntryGuest(body, input.kind));
    await this.assertCategoryFits(stayId, input.categoryId, input.kind);
    await this.assertGuest(stayId, guest.guestId);
    const row = await this.prisma.travelCashEntry.create({
      data: { ...input, ...guest, stayId, authorId: userId },
      select: entrySelect,
    });
    return toEntryDto(row);
  }

  async updateEntry(
    userId: string,
    stayId: string,
    entryId: string,
    body: Record<string, unknown>,
  ): Promise<TravelCashEntryDto> {
    await this.assertManager(userId, stayId);
    await this.findEntry(stayId, entryId);
    const input = this.parse(() => parseCashEntryInput(body));
    const guest = this.parse(() => parseEntryGuest(body, input.kind));
    await this.assertCategoryFits(stayId, input.categoryId, input.kind);
    await this.assertGuest(stayId, guest.guestId);
    const row = await this.prisma.travelCashEntry.update({
      where: { id: entryId },
      data: { ...input, ...guest },
      select: entrySelect,
    });
    return toEntryDto(row);
  }

  async removeEntry(
    userId: string,
    stayId: string,
    entryId: string,
  ): Promise<void> {
    await this.assertManager(userId, stayId);
    await this.findEntry(stayId, entryId);
    await this.prisma.travelCashEntry.delete({ where: { id: entryId } });
  }

  /**
   * Удалить выбранные записи. Условие по объекту — в самом запросе: чужой id
   * в списке просто не совпадёт и не удалит запись другой кассы.
   */
  async removeEntries(
    userId: string,
    stayId: string,
    body: { ids?: unknown },
  ): Promise<{ removed: number }> {
    await this.assertManager(userId, stayId);
    const ids = this.parse(() => parseEntryIds(body.ids));
    const { count } = await this.prisma.travelCashEntry.deleteMany({
      where: { id: { in: ids }, stayId },
    });
    return { removed: count };
  }

  async setOpening(
    userId: string,
    stayId: string,
    body: { openingMinor?: unknown },
  ): Promise<{ openingMinor: number }> {
    await this.assertManager(userId, stayId);
    const openingMinor = this.parse(() => parseOpeningMinor(body.openingMinor));
    await this.prisma.travelStay.update({
      where: { id: stayId },
      data: { cashOpeningMinor: openingMinor },
    });
    return { openingMinor };
  }

  private listCategories(stayId: string) {
    return this.prisma.travelCashCategory.findMany({
      where: { stayId },
      select: categorySelect,
      orderBy: [{ kind: 'asc' }, { position: 'asc' }, { name: 'asc' }],
    });
  }

  private async sumsByKind(where: Prisma.TravelCashEntryWhereInput) {
    const groups = await this.prisma.travelCashEntry.groupBy({
      by: ['kind'],
      where,
      _sum: { amountMinor: true },
    });
    return groups.map((group) => ({
      kind: group.kind,
      amountMinor: group._sum.amountMinor,
    }));
  }

  /**
   * Статья обязана принадлежать этому объекту и совпадать по виду: расход в
   * статье «Проживание» перевернул бы итоги статистики.
   */
  private async assertCategoryFits(
    stayId: string,
    categoryId: string | null,
    kind: 'income' | 'expense',
  ): Promise<void> {
    if (!categoryId) return;
    const category = await this.prisma.travelCashCategory.findFirst({
      where: { id: categoryId, stayId },
      select: { kind: true },
    });
    if (!category) throw new BadRequestException('Статья не найдена');
    if (category.kind !== kind) {
      throw new BadRequestException(
        kind === 'income'
          ? 'Это статья расходов — для дохода выберите другую'
          : 'Это статья доходов — для расхода выберите другую',
      );
    }
  }

  /** Гость обязан быть из клиентской базы этого же объекта. */
  private async assertGuest(stayId: string, guestId: string | null) {
    if (!guestId) return;
    const guest = await this.prisma.travelGuest.findFirst({
      where: { id: guestId, stayId },
      select: { id: true },
    });
    if (!guest) throw new BadRequestException('Гость не найден');
  }

  private async findCategory(stayId: string, categoryId: string) {
    const row = await this.prisma.travelCashCategory.findFirst({
      where: { id: categoryId, stayId },
      select: { id: true, kind: true },
    });
    if (!row) throw new NotFoundException('Статья не найдена');
    return row;
  }

  private async findEntry(stayId: string, entryId: string) {
    const row = await this.prisma.travelCashEntry.findFirst({
      where: { id: entryId, stayId },
      select: { id: true },
    });
    if (!row) throw new NotFoundException('Запись не найдена');
    return row;
  }

  private parse<T>(run: () => T): T {
    try {
      return run();
    } catch (error) {
      if (error instanceof CashInputError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }

  private async assertManager(userId: string, stayId: string) {
    const stay = await this.prisma.travelStay.findFirst({
      where: { id: stayId, managers: { some: { userId } } },
      select: { id: true },
    });
    if (!stay) throw new NotFoundException('Объект не найден');
  }
}
