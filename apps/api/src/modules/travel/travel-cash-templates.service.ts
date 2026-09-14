import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  TravelCashTemplateDto,
  TravelCashTemplatesResponse,
} from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { CashInputError } from './cash-input';
import {
  MAX_TEMPLATES_PER_STAY,
  parseCashTemplateInput,
  type CashTemplateInput,
} from './cash-templates';

const templateSelect = {
  id: true,
  name: true,
  kind: true,
  amountMinor: true,
  categoryId: true,
  note: true,
  tags: true,
} satisfies Prisma.TravelCashTemplateSelect;

/** Шаблоны записей кассы объекта — те же права, что у самой кассы. */
@Injectable()
export class TravelCashTemplatesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    userId: string,
    stayId: string,
  ): Promise<TravelCashTemplatesResponse> {
    await this.assertManager(userId, stayId);
    const items = await this.prisma.travelCashTemplate.findMany({
      where: { stayId },
      select: templateSelect,
      orderBy: [{ kind: 'asc' }, { name: 'asc' }],
    });
    return { items };
  }

  async create(
    userId: string,
    stayId: string,
    body: Record<string, unknown>,
  ): Promise<TravelCashTemplateDto> {
    await this.assertManager(userId, stayId);
    const input = this.parse(body);
    await this.assertCategory(stayId, input);
    const count = await this.prisma.travelCashTemplate.count({
      where: { stayId },
    });
    if (count >= MAX_TEMPLATES_PER_STAY) {
      throw new BadRequestException(
        `Шаблонов не больше ${MAX_TEMPLATES_PER_STAY} — удалите ненужные`,
      );
    }
    return this.save(() =>
      this.prisma.travelCashTemplate.create({
        data: { ...input, stayId },
        select: templateSelect,
      }),
    );
  }

  async update(
    userId: string,
    stayId: string,
    templateId: string,
    body: Record<string, unknown>,
  ): Promise<TravelCashTemplateDto> {
    await this.assertManager(userId, stayId);
    await this.find(stayId, templateId);
    const input = this.parse(body);
    await this.assertCategory(stayId, input);
    return this.save(() =>
      this.prisma.travelCashTemplate.update({
        where: { id: templateId },
        data: input,
        select: templateSelect,
      }),
    );
  }

  async remove(
    userId: string,
    stayId: string,
    templateId: string,
  ): Promise<void> {
    await this.assertManager(userId, stayId);
    await this.find(stayId, templateId);
    await this.prisma.travelCashTemplate.delete({ where: { id: templateId } });
  }

  private async save(
    run: () => Promise<TravelCashTemplateDto>,
  ): Promise<TravelCashTemplateDto> {
    try {
      return await run();
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new BadRequestException('Шаблон с таким названием уже есть');
      }
      throw error;
    }
  }

  /** Статья шаблона — этого объекта и того же вида, как у самой записи. */
  private async assertCategory(stayId: string, input: CashTemplateInput) {
    if (!input.categoryId) return;
    const category = await this.prisma.travelCashCategory.findFirst({
      where: { id: input.categoryId, stayId },
      select: { kind: true },
    });
    if (!category) throw new BadRequestException('Статья не найдена');
    if (category.kind !== input.kind) {
      throw new BadRequestException('Статья другого вида, чем шаблон');
    }
  }

  private parse(body: Record<string, unknown>) {
    try {
      return parseCashTemplateInput(body);
    } catch (error) {
      if (error instanceof CashInputError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }

  private async find(stayId: string, templateId: string) {
    const row = await this.prisma.travelCashTemplate.findFirst({
      where: { id: templateId, stayId },
      select: { id: true },
    });
    if (!row) throw new NotFoundException('Шаблон не найден');
  }

  private async assertManager(userId: string, stayId: string) {
    const stay = await this.prisma.travelStay.findFirst({
      where: { id: stayId, managers: { some: { userId } } },
      select: { id: true },
    });
    if (!stay) throw new NotFoundException('Объект не найден');
  }
}
