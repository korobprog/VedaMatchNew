import { Injectable, NotFoundException } from '@nestjs/common';
import type {
  WellnessIngredientClass,
  WellnessIngredientSeverity,
  WellnessProductStatus,
} from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { WellnessService } from './wellness.service';

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
  ) {}

  products(status: WellnessProductStatus) {
    return this.prisma.wellnessProduct.findMany({
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
      },
    });
  }

  /**
   * Одобрение перечитывает состав заново: справочник мог пополниться, пока
   * продукт ждал очереди, и публиковать старый разбор нельзя.
   */
  async approve(id: string, adminId: string) {
    const product = await this.prisma.wellnessProduct.findUnique({
      where: { id },
      select: { id: true, ingredientsRaw: true },
    });
    if (!product) throw new NotFoundException('Продукт не найден');
    await this.wellness.storeComposition(product.id, product.ingredientsRaw);
    return this.prisma.wellnessProduct.update({
      where: { id },
      data: {
        status: 'published',
        reviewedById: adminId,
        reviewedAt: new Date(),
        rejectReason: null,
      },
      select: { id: true, status: true },
    });
  }

  async reject(id: string, adminId: string, reason: string) {
    const exists = await this.prisma.wellnessProduct.count({ where: { id } });
    if (!exists) throw new NotFoundException('Продукт не найден');
    return this.prisma.wellnessProduct.update({
      where: { id },
      data: {
        status: 'rejected',
        reviewedById: adminId,
        reviewedAt: new Date(),
        rejectReason: reason,
      },
      select: { id: true, status: true },
    });
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
