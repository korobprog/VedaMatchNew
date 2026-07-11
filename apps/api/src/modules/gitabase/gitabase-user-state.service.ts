import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma, type GitabaseAnnotationKind } from '@prisma/client';
import type {
  GitabaseClientMutation,
  GitabaseLocator,
} from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';

export interface GitabaseProgressPayload {
  bookSlug: string;
  locator: GitabaseLocator;
  percentage: number;
  lastReadAt: Date;
}

export interface GitabaseBookmarkPayload {
  bookSlug: string;
  locator: GitabaseLocator;
  label: string | null;
  deletedAt: Date | null;
}

export interface GitabaseAnnotationPayload {
  bookSlug: string;
  kind: GitabaseAnnotationKind;
  locator: GitabaseLocator;
  range: Prisma.InputJsonObject;
  color: string | null;
  noteText: string | null;
  deletedAt: Date | null;
}

export type ValidatedGitabaseMutation =
  | (Omit<GitabaseClientMutation, 'entity' | 'payload'> & {
      entity: 'progress';
      payload: GitabaseProgressPayload;
    })
  | (Omit<GitabaseClientMutation, 'entity' | 'payload'> & {
      entity: 'bookmark';
      payload: GitabaseBookmarkPayload;
    })
  | (Omit<GitabaseClientMutation, 'entity' | 'payload'> & {
      entity: 'annotation';
      payload: GitabaseAnnotationPayload;
    });

export interface AppliedGitabaseMutation {
  revision: number;
  payload: Prisma.InputJsonObject;
}

type GitabaseTransaction = Pick<
  Prisma.TransactionClient,
  | 'gitabaseReadingProgress'
  | 'gitabaseBookmark'
  | 'gitabaseAnnotation'
  | 'gitabaseAnnotationRevision'
>;

@Injectable()
export class GitabaseUserStateService {
  constructor(private readonly prisma: PrismaService) {}

  applyMutation(
    userId: string,
    mutation: ValidatedGitabaseMutation,
    transaction: GitabaseTransaction = this.prisma,
  ): Promise<AppliedGitabaseMutation> {
    switch (mutation.entity) {
      case 'progress':
        return this.applyProgress(transaction, userId, mutation);
      case 'bookmark':
        return this.applyBookmark(transaction, userId, mutation);
      case 'annotation':
        return this.applyAnnotation(transaction, userId, mutation);
    }
  }

  private async applyProgress(
    transaction: GitabaseTransaction,
    userId: string,
    mutation: Extract<ValidatedGitabaseMutation, { entity: 'progress' }>,
  ): Promise<AppliedGitabaseMutation> {
    const current = await transaction.gitabaseReadingProgress.findUnique({
      where: {
        userId_bookSlug: { userId, bookSlug: mutation.payload.bookSlug },
      },
      select: { revision: true },
    });
    const revision = (current?.revision ?? 0) + 1;
    const saved = await transaction.gitabaseReadingProgress.upsert({
      where: {
        userId_bookSlug: { userId, bookSlug: mutation.payload.bookSlug },
      },
      create: {
        userId,
        bookSlug: mutation.payload.bookSlug,
        locator: toJson(mutation.payload.locator),
        percentage: mutation.payload.percentage,
        lastReadAt: mutation.payload.lastReadAt,
        revision,
      },
      update: {
        locator: toJson(mutation.payload.locator),
        percentage: mutation.payload.percentage,
        lastReadAt: mutation.payload.lastReadAt,
        revision,
      },
      select: { revision: true },
    });

    return {
      revision: saved.revision,
      payload: toJson({
        bookSlug: mutation.payload.bookSlug,
        locator: mutation.payload.locator,
        percentage: mutation.payload.percentage,
        lastReadAt: mutation.payload.lastReadAt.toISOString(),
      }),
    };
  }

  private async applyBookmark(
    transaction: GitabaseTransaction,
    userId: string,
    mutation: Extract<ValidatedGitabaseMutation, { entity: 'bookmark' }>,
  ): Promise<AppliedGitabaseMutation> {
    const current = await transaction.gitabaseBookmark.findUnique({
      where: { id: mutation.entityId },
      select: { userId: true, revision: true },
    });
    this.assertOwnedEntity(current?.userId, userId);
    const revision = (current?.revision ?? 0) + 1;
    const data = {
      bookSlug: mutation.payload.bookSlug,
      locator: toJson(mutation.payload.locator),
      label: mutation.payload.label,
      deletedAt: mutation.payload.deletedAt,
      revision,
    };
    const saved = current
      ? await transaction.gitabaseBookmark.update({
          where: { id: mutation.entityId },
          data,
          select: { revision: true },
        })
      : await transaction.gitabaseBookmark.create({
          data: { id: mutation.entityId, userId, ...data },
          select: { revision: true },
        });

    return {
      revision: saved.revision,
      payload: toJson({
        bookSlug: mutation.payload.bookSlug,
        locator: mutation.payload.locator,
        label: mutation.payload.label,
        deletedAt: mutation.payload.deletedAt?.toISOString() ?? null,
      }),
    };
  }

  private async applyAnnotation(
    transaction: GitabaseTransaction,
    userId: string,
    mutation: Extract<ValidatedGitabaseMutation, { entity: 'annotation' }>,
  ): Promise<AppliedGitabaseMutation> {
    const current = await transaction.gitabaseAnnotation.findUnique({
      where: { id: mutation.entityId },
      select: { userId: true, revision: true, noteText: true },
    });
    this.assertOwnedEntity(current?.userId, userId);
    const revision = (current?.revision ?? 0) + 1;
    const hasNoteConflict =
      current != null &&
      mutation.baseRevision !== current.revision &&
      mutation.payload.noteText !== current.noteText;
    if (hasNoteConflict) {
      await transaction.gitabaseAnnotationRevision.create({
        data: {
          annotationId: mutation.entityId,
          revision: current.revision,
          noteText: current.noteText,
        },
      });
    }

    const data = {
      bookSlug: mutation.payload.bookSlug,
      kind: mutation.payload.kind,
      locator: toJson(mutation.payload.locator),
      range: mutation.payload.range,
      color: mutation.payload.color,
      noteText: mutation.payload.noteText,
      deletedAt: mutation.payload.deletedAt,
      revision,
    };
    const saved = current
      ? await transaction.gitabaseAnnotation.update({
          where: { id: mutation.entityId },
          data,
          select: { revision: true },
        })
      : await transaction.gitabaseAnnotation.create({
          data: { id: mutation.entityId, userId, ...data },
          select: { revision: true },
        });

    return {
      revision: saved.revision,
      payload: toJson({
        bookSlug: mutation.payload.bookSlug,
        kind: mutation.payload.kind,
        locator: mutation.payload.locator,
        range: mutation.payload.range,
        color: mutation.payload.color,
        noteText: mutation.payload.noteText,
        deletedAt: mutation.payload.deletedAt?.toISOString() ?? null,
      }),
    };
  }

  private assertOwnedEntity(ownerId: string | undefined, userId: string) {
    if (ownerId !== undefined && ownerId !== userId) {
      throw new BadRequestException('Entity ID is already in use');
    }
  }
}

function toJson(value: unknown): Prisma.InputJsonObject {
  return value as Prisma.InputJsonObject;
}
