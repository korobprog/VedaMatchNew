import { ForbiddenException, Injectable } from '@nestjs/common';
import type { AuthProvider } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { portalHost } from './portal-host';

export { portalHost };

@Injectable()
export class AuthProvidersService {
  constructor(private readonly prisma: PrismaService) {}

  private async settings() {
    return this.prisma.authProviderSetting.findMany({
      orderBy: { sortOrder: 'asc' },
    });
  }

  async visibleFor(host: string): Promise<AuthProvider[]> {
    const portal = portalHost(host);
    const rows = await this.settings();
    return rows
      .filter((row) => row.enabled && row.domains.includes(portal))
      .map((row) => row.provider);
  }

  /**
   * Проверяется в каждом обработчике входа, а не только при выдаче списка:
   * спрятанная кнопка не делает способ недоступным, а для 406-ФЗ важно, что
   * вход технически невозможен.
   */
  async assertEnabled(provider: AuthProvider, host: string): Promise<void> {
    const visible = await this.visibleFor(host);
    if (!visible.includes(provider)) {
      throw new ForbiddenException('Этот способ входа недоступен');
    }
  }
}
