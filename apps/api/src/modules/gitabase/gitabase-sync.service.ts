import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  GitabaseLocator,
  GitabaseMutationEntity,
  GitabaseSyncPullResponse,
  GitabaseSyncPushRequest,
  GitabaseSyncPushResponse,
} from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';
import {
  GitabaseUserStateService,
  type GitabaseAnnotationPayload,
  type GitabaseBookmarkPayload,
  type GitabaseProgressPayload,
  type ValidatedGitabaseMutation,
} from './gitabase-user-state.service';

const MAX_PUSH_MUTATIONS = 100;
const MAX_PULL_CHANGES = 500;
const MAX_NOTE_TEXT_LENGTH = 20_000;
const MUTATION_ENTITIES: GitabaseMutationEntity[] = [
  'progress',
  'bookmark',
  'annotation',
];

interface SyncCursor {
  createdAt: Date;
  id: string;
}

@Injectable()
export class GitabaseSyncService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly userState: GitabaseUserStateService,
  ) {}

  async push(
    userId: string,
    request: GitabaseSyncPushRequest,
  ): Promise<GitabaseSyncPushResponse> {
    const mutations = validatePushRequest(request);
    const accepted = await this.prisma.$transaction(async (transaction) => {
      const results: GitabaseSyncPushResponse['accepted'] = [];
      for (const mutation of mutations) {
        const existing = await transaction.gitabaseSyncMutation.findUnique({
          where: {
            userId_clientMutationId: {
              userId,
              clientMutationId: mutation.clientMutationId,
            },
          },
          select: { revision: true },
        });
        if (existing) {
          results.push({
            clientMutationId: mutation.clientMutationId,
            revision: existing.revision,
          });
          continue;
        }

        const applied = await this.userState.applyMutation(
          userId,
          mutation,
          transaction,
        );
        await transaction.gitabaseSyncMutation.create({
          data: {
            userId,
            clientMutationId: mutation.clientMutationId,
            entity: mutation.entity,
            entityId: mutation.entityId,
            revision: applied.revision,
            payload: applied.payload,
          },
        });
        results.push({
          clientMutationId: mutation.clientMutationId,
          revision: applied.revision,
        });
      }
      return results;
    });
    const latest = await this.prisma.gitabaseSyncMutation.findFirst({
      where: { userId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: { createdAt: true, id: true },
    });

    return {
      accepted,
      cursor: latest ? encodeCursor(latest) : '',
    };
  }

  async pull(
    userId: string,
    after?: string,
  ): Promise<GitabaseSyncPullResponse> {
    const cursor = after === undefined ? null : decodeCursor(after);
    const rows = await this.prisma.gitabaseSyncMutation.findMany({
      where: cursor
        ? {
            userId,
            OR: [
              { createdAt: { gt: cursor.createdAt } },
              {
                createdAt: cursor.createdAt,
                id: { gt: cursor.id },
              },
            ],
          }
        : { userId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: MAX_PULL_CHANGES,
    });
    const last = rows.at(-1);

    return {
      changes: rows.map((row) => ({
        entity: row.entity as GitabaseMutationEntity,
        entityId: row.entityId,
        revision: row.revision,
        payload: row.payload,
      })),
      cursor: last
        ? encodeCursor({ createdAt: last.createdAt, id: last.id })
        : (after ?? ''),
    };
  }
}

function validatePushRequest(request: unknown): ValidatedGitabaseMutation[] {
  if (!isRecord(request) || !Array.isArray(request.mutations)) {
    throw new BadRequestException('mutations must be an array');
  }
  if (request.mutations.length > MAX_PUSH_MUTATIONS) {
    throw new BadRequestException(
      `A sync batch may contain at most ${MAX_PUSH_MUTATIONS} mutations`,
    );
  }
  return request.mutations.map((mutation) => validateMutation(mutation));
}

function validateMutation(value: unknown): ValidatedGitabaseMutation {
  if (!isRecord(value)) {
    throw new BadRequestException('Each mutation must be an object');
  }
  const clientMutationId = requireNonBlankString(
    value.clientMutationId,
    'clientMutationId',
  );
  const entityId = requireNonBlankString(value.entityId, 'entityId');
  if (!MUTATION_ENTITIES.includes(value.entity as GitabaseMutationEntity)) {
    throw new BadRequestException(
      `Unknown mutation entity: ${String(value.entity)}`,
    );
  }
  const entity = value.entity as GitabaseMutationEntity;
  const baseRevision = validateBaseRevision(value.baseRevision);
  const createdAt = requireDate(value.createdAt, 'createdAt').toISOString();
  const common = { clientMutationId, entityId, baseRevision, createdAt };

  switch (entity) {
    case 'progress':
      return {
        ...common,
        entity,
        payload: validateProgressPayload(value.payload, entityId),
      };
    case 'bookmark':
      return {
        ...common,
        entity,
        payload: validateBookmarkPayload(value.payload),
      };
    case 'annotation':
      return {
        ...common,
        entity,
        payload: validateAnnotationPayload(value.payload),
      };
  }
}

function validateProgressPayload(
  value: unknown,
  entityId: string,
): GitabaseProgressPayload {
  const payload = requireRecord(value, 'progress payload');
  const bookSlug = requireNonBlankString(payload.bookSlug, 'bookSlug');
  if (bookSlug !== entityId) {
    throw new BadRequestException('Progress entityId must match bookSlug');
  }
  if (
    !Number.isInteger(payload.percentage) ||
    Number(payload.percentage) < 0 ||
    Number(payload.percentage) > 100
  ) {
    throw new BadRequestException(
      'percentage must be an integer from 0 to 100',
    );
  }
  return {
    bookSlug,
    locator: validateLocator(payload.locator, bookSlug),
    percentage: Number(payload.percentage),
    lastReadAt: requireDate(payload.lastReadAt, 'lastReadAt'),
  };
}

function validateBookmarkPayload(value: unknown): GitabaseBookmarkPayload {
  const payload = requireRecord(value, 'bookmark payload');
  const bookSlug = requireNonBlankString(payload.bookSlug, 'bookSlug');
  return {
    bookSlug,
    locator: validateLocator(payload.locator, bookSlug),
    label: optionalString(payload.label, 'label'),
    deletedAt: optionalDate(payload.deletedAt, 'deletedAt'),
  };
}

function validateAnnotationPayload(value: unknown): GitabaseAnnotationPayload {
  const payload = requireRecord(value, 'annotation payload');
  const bookSlug = requireNonBlankString(payload.bookSlug, 'bookSlug');
  if (payload.kind !== 'highlight' && payload.kind !== 'note') {
    throw new BadRequestException('kind must be highlight or note');
  }
  const noteText = optionalString(payload.noteText, 'noteText');
  if (noteText != null && noteText.length > MAX_NOTE_TEXT_LENGTH) {
    throw new BadRequestException(
      `noteText may contain at most ${MAX_NOTE_TEXT_LENGTH} characters`,
    );
  }
  const range = requireRecord(payload.range, 'range');
  assertJsonValue(range, 'range');
  return {
    bookSlug,
    kind: payload.kind,
    locator: validateLocator(payload.locator, bookSlug),
    range: range as Prisma.InputJsonObject,
    color: optionalString(payload.color, 'color'),
    noteText,
    deletedAt: optionalDate(payload.deletedAt, 'deletedAt'),
  };
}

function validateLocator(value: unknown, bookSlug: string): GitabaseLocator {
  const locator = requireRecord(value, 'locator');
  const locatorBookSlug = requireNonBlankString(
    locator.bookSlug,
    'locator.bookSlug',
  );
  if (locatorBookSlug !== bookSlug) {
    throw new BadRequestException('locator.bookSlug must match bookSlug');
  }
  const result: GitabaseLocator = {
    bookSlug: locatorBookSlug,
    chapterSlug: requireNonBlankString(
      locator.chapterSlug,
      'locator.chapterSlug',
    ),
    unitId: requireNonBlankString(locator.unitId, 'locator.unitId'),
  };
  if (locator.block !== undefined) {
    result.block = requireNonBlankString(locator.block, 'locator.block');
  }
  if (locator.start !== undefined) {
    result.start = requireNonNegativeInteger(locator.start, 'locator.start');
  }
  if (locator.end !== undefined) {
    result.end = requireNonNegativeInteger(locator.end, 'locator.end');
  }
  if (
    result.start !== undefined &&
    result.end !== undefined &&
    result.start > result.end
  ) {
    throw new BadRequestException('locator.start must not exceed locator.end');
  }
  return result;
}

function validateBaseRevision(value: unknown): number | null {
  if (value === null) return null;
  if (!Number.isInteger(value) || Number(value) < 0) {
    throw new BadRequestException(
      'baseRevision must be a non-negative integer or null',
    );
  }
  return Number(value);
}

function requireRecord(value: unknown, field: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new BadRequestException(`${field} must be an object`);
  }
  return value;
}

function requireNonBlankString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new BadRequestException(`${field} must be a non-blank string`);
  }
  return value.trim();
}

function optionalString(value: unknown, field: string): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') {
    throw new BadRequestException(`${field} must be a string or null`);
  }
  return value;
}

function requireDate(value: unknown, field: string): Date {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new BadRequestException(`${field} must be an ISO date string`);
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new BadRequestException(`${field} must be an ISO date string`);
  }
  return date;
}

function optionalDate(value: unknown, field: string): Date | null {
  if (value === undefined || value === null) return null;
  return requireDate(value, field);
}

function requireNonNegativeInteger(value: unknown, field: string): number {
  if (!Number.isInteger(value) || Number(value) < 0) {
    throw new BadRequestException(`${field} must be a non-negative integer`);
  }
  return Number(value);
}

function assertJsonValue(value: unknown, field: string): void {
  try {
    const serialized = JSON.stringify(value);
    if (serialized === undefined) throw new Error('not JSON');
  } catch {
    throw new BadRequestException(`${field} must be valid JSON`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function encodeCursor(cursor: SyncCursor): string {
  return Buffer.from(
    JSON.stringify({
      createdAt: cursor.createdAt.toISOString(),
      id: cursor.id,
    }),
    'utf8',
  ).toString('base64url');
}

function decodeCursor(value: string): SyncCursor {
  try {
    const decoded = JSON.parse(
      Buffer.from(value, 'base64url').toString('utf8'),
    ) as unknown;
    if (!isRecord(decoded)) throw new Error('invalid cursor');
    return {
      createdAt: requireDate(decoded.createdAt, 'cursor.createdAt'),
      id: requireNonBlankString(decoded.id, 'cursor.id'),
    };
  } catch (error) {
    if (error instanceof BadRequestException) throw error;
    throw new BadRequestException('Malformed sync cursor');
  }
}
