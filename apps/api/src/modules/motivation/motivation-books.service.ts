import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { VedabaseBookKind } from '@prisma/client';
import type {
  AccessTokenPayload,
  MotivationBookDto,
  MotivationBookKind,
} from '@vedamatch/shared';
import { isAdmin } from './is-admin';
import { VedabaseContentRepository } from '../vedabase/vedabase-content.repository';

const allowedKinds = new Set<string>(Object.values(VedabaseBookKind));

/**
 * Пометка книг библиотеки для подбора цитат.
 *
 * Живёт в модуле Motivation, потому что смысл пометки чисто мотивационный:
 * какие книги разбирать на цитаты. Сами данные читаются и пишутся через
 * репозиторий Vedabase, а не напрямую.
 */
@Injectable()
export class MotivationBooksService {
  constructor(private readonly repository: VedabaseContentRepository) {}

  async list(user: AccessTokenPayload): Promise<MotivationBookDto[]> {
    this.admin(user);
    const books = await this.repository.listBooksForQuoteMining();
    return books.map((book) => ({
      ...book,
      kind: book.kind,
    }));
  }

  async setKind(
    user: AccessTokenPayload,
    id: string,
    kind: MotivationBookKind,
  ): Promise<MotivationBookDto> {
    this.admin(user);
    if (!allowedKinds.has(kind))
      throw new BadRequestException('Unknown book kind');
    const book = await this.repository.setBookKind(id, kind);
    return { ...book, kind: book.kind };
  }

  private admin(user: AccessTokenPayload) {
    if (!isAdmin(user)) throw new ForbiddenException();
  }
}
