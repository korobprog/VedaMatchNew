import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  CreateLibraryCommentRequest,
  LibraryCommentDto,
  LibraryCommentsResponse,
} from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';

const MAX_BODY_LENGTH = 2000;
const PAGE_SIZE = 100;

const COMMENT_SELECT = {
  id: true,
  entryId: true,
  body: true,
  status: true,
  createdAt: true,
  userId: true,
  user: { select: { id: true, name: true } },
};

type CommentRow = {
  id: string;
  entryId: string;
  body: string;
  status: string;
  createdAt: Date;
  userId: string | null;
  user: { id: string; name: string } | null;
};

@Injectable()
export class LibraryCommentsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    entryId: string,
    viewerId: string,
    viewerIsAdmin = false,
  ): Promise<LibraryCommentsResponse> {
    await this.ensureEntry(entryId);
    const rows = await this.prisma.libraryComment.findMany({
      where: { entryId, status: 'published' },
      orderBy: { createdAt: 'asc' },
      take: PAGE_SIZE,
      select: COMMENT_SELECT,
    });

    return {
      items: rows.map((row) => toCommentDto(row, viewerId, viewerIsAdmin)),
      total: rows.length,
    };
  }

  async create(
    entryId: string,
    userId: string,
    body: CreateLibraryCommentRequest,
  ): Promise<LibraryCommentDto> {
    const text = body?.body?.trim();
    if (!text) throw new BadRequestException('comment_required');
    if (text.length > MAX_BODY_LENGTH) {
      throw new BadRequestException('comment_too_long');
    }
    await this.ensureEntry(entryId);

    const created = await this.prisma.$transaction(async (tx) => {
      const comment = await tx.libraryComment.create({
        data: { entryId, userId, body: text },
        select: COMMENT_SELECT,
      });
      await tx.libraryEntry.update({
        where: { id: entryId },
        data: { commentsCount: { increment: 1 } },
      });
      return comment;
    });

    return toCommentDto(created, userId, false);
  }

  /** Удаляет автор или админ; сам текст стираем, строку оставляем со статусом. */
  async remove(
    commentId: string,
    userId: string,
    isAdmin = false,
  ): Promise<void> {
    const comment = await this.prisma.libraryComment.findUnique({
      where: { id: commentId },
      select: { id: true, userId: true, entryId: true, status: true },
    });
    if (!comment) throw new NotFoundException('comment_not_found');
    if (comment.status !== 'published') return;
    if (comment.userId !== userId && !isAdmin) {
      throw new ForbiddenException('not_comment_author');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.libraryComment.update({
        where: { id: commentId },
        data: {
          body: '',
          status:
            isAdmin && comment.userId !== userId
              ? 'removed_by_admin'
              : 'removed_by_author',
        },
      });
      await tx.libraryEntry.update({
        where: { id: comment.entryId },
        data: { commentsCount: { decrement: 1 } },
      });
    });
  }

  private async ensureEntry(entryId: string): Promise<void> {
    const entry = await this.prisma.libraryEntry.findUnique({
      where: { id: entryId },
      select: { status: true },
    });
    if (!entry || entry.status !== 'published') {
      throw new NotFoundException('entry_not_found');
    }
  }
}

function toCommentDto(
  row: CommentRow,
  viewerId: string,
  viewerIsAdmin: boolean,
): LibraryCommentDto {
  return {
    id: row.id,
    entryId: row.entryId,
    body: row.body,
    status: row.status as LibraryCommentDto['status'],
    createdAt: row.createdAt.toISOString(),
    author: row.user ? { id: row.user.id, name: row.user.name } : null,
    canDelete: viewerIsAdmin || row.userId === viewerId,
  };
}
