import { Injectable } from '@nestjs/common';
import type { UnionShowcaseResponse } from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { UserGalleryService } from '../users/user-gallery.service';
import {
  SHOWCASE_LIMIT,
  toShowcaseDraft,
  type ShowcaseCandidate,
} from './union-showcase';

/**
 * Витрина на публичной странице сервиса. Единственное место Union, куда
 * ходит гость, поэтому отбор кандидатов держим отдельно от рекомендаций:
 * там условия про совместимость со смотрящим, а здесь — про согласие
 * показываться всему интернету. Условия перечислены в `toShowcaseDraft`.
 */
@Injectable()
export class UnionShowcaseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gallery: UserGalleryService,
  ) {}

  async showcase(): Promise<UnionShowcaseResponse> {
    // Берём с запасом: часть согласившихся отсеется уже в памяти — по
    // приватности фото, проверке снимков и блокировке аккаунта. Условия,
    // выразимые в SQL, стоят в where, чтобы запас не пришлось делать большим.
    const rows = await this.prisma.unionProfile.findMany({
      where: {
        showcaseOptIn: true,
        showcaseBlockedAt: null,
        isActive: true,
        user: { accountStatus: 'active', photoVerifiedAt: { not: null } },
      },
      orderBy: { updatedAt: 'desc' },
      take: SHOWCASE_LIMIT * 3,
      select: {
        showcaseOptIn: true,
        showcaseBlockedAt: true,
        isActive: true,
        privacy: true,
        interests: true,
        user: {
          select: {
            id: true,
            name: true,
            spiritualName: true,
            about: true,
            birthDate: true,
            homeLocation: true,
            accountStatus: true,
            photoVerifiedAt: true,
            // Только публичные снимки галереи: приватные не видит и
            // вошедший, значит на публичной странице им тем более не место.
            photos: {
              where: { isPublic: true },
              orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
              take: 1,
              select: {
                id: true,
                storageKey: true,
                width: true,
                height: true,
              },
            },
          },
        },
      },
    });

    const drafts = rows
      .map((row) => toShowcaseDraft(row as unknown as ShowcaseCandidate))
      .filter((draft) => draft !== null)
      .slice(0, SHOWCASE_LIMIT);

    const signed = await this.gallery.signPublicPhotos(
      drafts.map((draft) => draft.photo),
    );
    const cards = drafts.map((draft, index) => ({
      ...draft.card,
      photoUrl: signed[index].url,
    }));
    return { cards };
  }
}
