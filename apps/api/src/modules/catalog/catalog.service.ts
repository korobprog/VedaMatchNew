import { Injectable } from '@nestjs/common';
import type { Role, ServiceCard } from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Записи каталога, которым не место на витрине.
 *
 * Карточка обещает сервис, в который заходят пользоваться. «Вход» же в
 * каталоге заведён ради другого: назначение менеджеру проверяет наличие
 * слага. Показывать его в общей сетке — обманывать: он ведёт в админку, а не
 * в сервис, и на главной у администратора выглядел ровно как остальные.
 *
 * Признак — адрес: всё, что ведёт в /admin, управляется, а не используется.
 */
const SHOWCASE_EXCLUDED = { url: { startsWith: '/admin' } } as const;

@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService) {}

  /** Сервисы, видимые пользователю: публичные + персональный доступ + доступ по этапу; админы видят всё. */
  async getForUser(userId: string, role: Role): Promise<ServiceCard[]> {
    const isAdmin = role === 'admin' || role === 'service-admin';
    const user = await this.prisma.user.findUnique({ where: { id: userId } });

    const stageFilters = user?.spiritualStage
      ? this.stageVisibilityFilter(
          user.spiritualStage,
          user.devoteeVerificationStatus,
        )
      : [];

    const services = await this.prisma.service.findMany({
      where: {
        NOT: SHOWCASE_EXCLUDED,
        ...(isAdmin
          ? {}
          : {
              status: { not: 'disabled' },
              OR: [
                { public: true },
                { access: { some: { userId } } },
                ...stageFilters,
              ],
            }),
      },
      // Заданный администратором порядок важнее статуса: «скоро» может
      // стоять выше активного, если так решили в каталоге.
      orderBy: [{ sortOrder: 'asc' }, { status: 'asc' }, { name: 'asc' }],
    });
    return services.map((s) => ({
      id: s.id,
      slug: s.slug,
      name: s.name,
      nameEn: s.nameEn,
      description: s.description,
      iconUrl: s.iconUrl,
      url: s.url,
      status: s.status,
      category: s.category,
      requiresDevoteeVerification:
        s.devoteeVerifiedVisible && !s.devoteeSelfIdentifiedVisible,
    }));
  }

  /**
   * Каталог для гостя: лендинг и шапка показывают названия сервисов ещё до
   * входа, поэтому им нужен маршрут без авторизации. Отдаются только публичные
   * и не выключенные карточки — ровно то, что и так видно на витрине.
   */
  async getPublic(): Promise<ServiceCard[]> {
    const services = await this.prisma.service.findMany({
      where: {
        public: true,
        status: { not: 'disabled' },
        NOT: SHOWCASE_EXCLUDED,
      },
      orderBy: [{ sortOrder: 'asc' }, { status: 'asc' }, { name: 'asc' }],
    });
    return services.map((s) => ({
      id: s.id,
      slug: s.slug,
      name: s.name,
      nameEn: s.nameEn,
      description: s.description,
      iconUrl: s.iconUrl,
      url: s.url,
      status: s.status,
      category: s.category,
      requiresDevoteeVerification:
        s.devoteeVerifiedVisible && !s.devoteeSelfIdentifiedVisible,
    }));
  }

  private stageVisibilityFilter(
    stage: string,
    status: string | null,
  ): Array<Record<string, boolean>> {
    if (stage === 'seeker') return [{ seekerVisible: true }];
    if (stage === 'practitioner') return [{ practitionerVisible: true }];
    if (stage === 'yogi') return [{ yogiVisible: true }];
    if (stage === 'devotee') {
      return status === 'confirmed'
        ? [
            { devoteeSelfIdentifiedVisible: true },
            { devoteeVerifiedVisible: true },
          ]
        : [{ devoteeSelfIdentifiedVisible: true }];
    }
    return [];
  }
}
