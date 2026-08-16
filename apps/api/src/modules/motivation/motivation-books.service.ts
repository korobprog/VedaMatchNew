import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { VedabaseBookKind } from '@prisma/client';
import type { MotivationBookDto, MotivationBookKind, Role } from '@vedamatch/shared';
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

  async list(role: Role): Promise<MotivationBookDto[]> {
    this.admin(role);
    const books = await this.repository.listBooksForQuoteMining();
    return books.map((book) => ({ ...book, kind: book.kind as MotivationBookKind }));
  }

  async setKind(
    role: Role,
    id: string,
    kind: MotivationBookKind,
  ): Promise<MotivationBookDto> {
    this.admin(role);
    if (!allowedKinds.has(kind))
      throw new BadRequestException('Unknown book kind');
    const book = await this.repository.setBookKind(
      id,
      kind as VedabaseBookKind,
    );
    return { ...book, kind: book.kind as MotivationBookKind };
  }

  private admin(role: Role) {
    if (role !== 'admin' && role !== 'service-admin')
      throw new ForbiddenException();
  }
}
