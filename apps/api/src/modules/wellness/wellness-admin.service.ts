import { Injectable, NotFoundException } from '@nestjs/common';
import type {
  WellnessIngredientClass,
  WellnessIngredientSeverity,
  WellnessProductStatus,
} from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { toCheckDto } from './check-dto';
import { WellnessCheckService } from './wellness-check.service';
import { WellnessService } from './wellness.service';

/** Что нужно о карточке, чтобы решить её и сообщить автору. */
const PRODUCT_FOR_DECISION = {
  id: true,
  barcode: true,
  name: true,
  ingredientsRaw: true,
  status: true,
  addedById: true,
} as const;

/**
 * Админка «Здоровья»: очередь продуктов, жалобы на состав и справочник
 * ингредиентов. Справочник здесь главный: он определяет, что сервис вообще
 * умеет находить, и правится чаще всего.
 */
@Injectable()
export class WellnessAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly wellness: WellnessService,
    private readonly checks: WellnessCheckService,
  ) {}

  /**
   * Очередь продуктов. У каждой карточки — её автопроверка (VED-384): что
   * предложил ИИ, чем подтвердил и почему не принял сам. Модератор — последняя
   * ступень, и решать ему надо, видя всё это, а не заново с нуля.
   */
  async products(status: WellnessProductStatus) {
    const rows = await this.prisma.wellnessProduct.findMany({
      where: { status },
      orderBy: { createdAt: 'asc' },
      take: 200,
      select: {
        id: true,
        barcode: true,
        name: true,
        brand: true,
        ingredientsRaw: true,
        imageUrl: true,
        labelImageUrl: true,
        source: true,
        status: true,
        createdAt: true,
        addedBy: { select: { id: true, name: true } },
        ingredients: {
          orderBy: { position: 'asc' },
          select: {
            matchedText: true,
            severity: true,
            ingredient: { select: { key: true, nameRu: true, class: true } },
          },
        },
        check: {
          select: {
            status: true,
            reasons: true,
            submittedName: true,
            submittedBrand: true,
            submittedIngredients: true,
            aiFound: true,
            aiNotFood: true,
            aiName: true,
            aiBrand: true,
            aiIngredients: true,
            aiConflicts: true,
            sources: true,
            attemptCount: true,
            costUsdMicros: true,
            finishedAt: true,
          },
        },
      },
    });
    return rows.map(({ check, ...row }) => ({
      ...row,
      check: check ? toCheckDto(check) : null,
    }));
  }

  /**
   * Одобрение перечитывает состав заново: справочник мог пополниться, пока
   * продукт ждал очереди, и публиковать старый разбор нельзя.
   */
  async approve(id: string, adminId: string) {
    const product = await this.prisma.wellnessProduct.findUnique({
      where: { id },
      select: PRODUCT_FOR_DECISION,
    });
    if (!product) throw new NotFoundException('Продукт не найден');
    await this.wellness.storeComposition(product.id, product.ingredientsRaw);
    const updated = await this.prisma.wellnessProduct.update({
      where: { id },
      data: {
        status: 'published',
        reviewedById: adminId,
        reviewedAt: new Date(),
        rejectReason: null,
      },
      select: { id: true, status: true },
    });
    // Повторное одобрение уже опубликованного — не новость для автора.
    if (product.status !== 'published') {
      await this.checks.moderatorDecided({
        product,
        approved: true,
        comment: null,
      });
    }
    return updated;
  }

  async reject(id: string, adminId: string, reason: string) {
    const product = await this.prisma.wellnessProduct.findUnique({
      where: { id },
      select: PRODUCT_FOR_DECISION,
    });
    if (!product) throw new NotFoundException('Продукт не найден');
    const updated = await this.prisma.wellnessProduct.update({
      where: { id },
      data: {
        status: 'rejected',
        reviewedById: adminId,
        reviewedAt: new Date(),
        rejectReason: reason,
      },
      select: { id: true, status: true },
    });
    if (product.status !== 'rejected') {
      await this.checks.moderatorDecided({
        product,
        approved: false,
        comment: reason,
      });
    }
    return updated;
  }

  reports() {
    return this.prisma.wellnessProductReport.findMany({
      where: { status: 'open' },
      orderBy: { createdAt: 'asc' },
      take: 200,
      select: {
        id: true,
        comment: true,
        createdAt: true,
        author: { select: { id: true, name: true } },
        product: { select: { id: true, name: true, barcode: true } },
      },
    });
  }

  async decideReport(id: string, adminId: string, accepted: boolean) {
    const exists = await this.prisma.wellnessProductReport.count({
      where: { id },
    });
    if (!exists) throw new NotFoundException('Жалоба не найдена');
    return this.prisma.wellnessProductReport.update({
      where: { id },
      data: {
        status: accepted ? 'accepted' : 'rejected',
        decidedById: adminId,
        decidedAt: new Date(),
      },
      select: { id: true, status: true },
    });
  }

  async saveIngredient(input: {
    id?: string;
    key: string;
    nameRu: string;
    nameEn: string;
    aliases: string[];
    class: WellnessIngredientClass;
    severity: WellnessIngredientSeverity;
    eNumber: string | null;
    noteRu: string | null;
  }) {
    const { id, ...data } = input;
    const saved = id
      ? await this.prisma.wellnessIngredient.update({ where: { id }, data })
      : await this.prisma.wellnessIngredient.create({
          data: { ...data, nameEn: data.nameEn || data.nameRu },
        });
    this.wellness.forgetCatalog();
    return saved;
  }

  async removeIngredient(id: string) {
    await this.prisma.wellnessIngredient.deleteMany({ where: { id } });
    this.wellness.forgetCatalog();
  }
}
