import { Injectable } from '@nestjs/common';
import type { Role, ServiceCard } from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService) {}

  /** Сервисы, видимые пользователю: публичные + выданные персонально; админы видят всё */
  async getForUser(userId: string, role: Role): Promise<ServiceCard[]> {
    const isAdmin = role === 'admin' || role === 'service-admin';
    const services = await this.prisma.service.findMany({
      where: isAdmin
        ? {}
        : {
            status: { not: 'disabled' },
            OR: [{ public: true }, { access: { some: { userId } } }],
          },
      orderBy: [{ status: 'asc' }, { name: 'asc' }],
    });
    return services.map((s) => ({
      id: s.id,
      slug: s.slug,
      name: s.name,
      description: s.description,
      iconUrl: s.iconUrl,
      url: s.url,
      status: s.status,
      category: s.category,
    }));
  }
}
