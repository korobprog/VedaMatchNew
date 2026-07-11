import { Prisma, type PrismaClient } from '@prisma/client';

type GitabaseDelegateName = keyof Pick<
  PrismaClient,
  | 'gitabaseReadingProgress'
  | 'gitabaseBookmark'
  | 'gitabaseAnnotation'
  | 'gitabaseAnnotationRevision'
  | 'gitabaseSyncMutation'
>;

function createPrismaContract() {
  return {
    gitabaseReadingProgress: { upsert: jest.fn() },
    gitabaseBookmark: { update: jest.fn() },
    gitabaseAnnotation: { update: jest.fn() },
    gitabaseAnnotationRevision: { create: jest.fn() },
    gitabaseSyncMutation: { findUnique: jest.fn() },
  } satisfies Record<GitabaseDelegateName, Record<string, jest.Mock>>;
}

describe('Gitabase user-state Prisma contract', () => {
  it('exposes the delegates required by the future user-state service', async () => {
    const prisma = createPrismaContract();
    const deletedAt = new Date('2026-07-10T00:00:00.000Z');

    await prisma.gitabaseReadingProgress.upsert({
      where: { userId_bookSlug: { userId: 'user-1', bookSlug: 'book-1' } },
      create: {
        userId: 'user-1',
        bookSlug: 'book-1',
        locator: { chapterSlug: 'chapter-1', unitId: 'unit-1' },
        percentage: 10,
        lastReadAt: deletedAt,
      },
      update: {
        locator: { chapterSlug: 'chapter-1', unitId: 'unit-2' },
        percentage: 20,
        lastReadAt: deletedAt,
      },
    });
    await prisma.gitabaseBookmark.update({
      where: { id: 'bookmark-1' },
      data: { deletedAt, revision: { increment: 1 } },
    });
    await prisma.gitabaseAnnotationRevision.create({
      data: {
        annotationId: 'annotation-1',
        revision: 1,
        noteText: 'Previous note',
      },
    });
    await prisma.gitabaseSyncMutation.findUnique({
      where: {
        userId_clientMutationId: {
          userId: 'user-1',
          clientMutationId: 'mutation-1',
        },
      },
    });

    expect(prisma.gitabaseReadingProgress.upsert).toHaveBeenCalledTimes(1);
    expect(prisma.gitabaseBookmark.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ deletedAt }) }),
    );
    expect(prisma.gitabaseAnnotationRevision.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ noteText: 'Previous note' }),
      }),
    );
    expect(prisma.gitabaseSyncMutation.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId_clientMutationId: expect.any(Object) },
      }),
    );
  });

  it('keeps only Gitabase user-state models in the generated schema', () => {
    const gitabaseModels = Prisma.dmmf.datamodel.models
      .map((model) => model.name)
      .filter((name) => name.startsWith('Gitabase'));

    expect(gitabaseModels).toEqual([
      'GitabaseReadingProgress',
      'GitabaseBookmark',
      'GitabaseAnnotation',
      'GitabaseAnnotationRevision',
      'GitabaseSyncMutation',
    ]);
    const annotationKind = Prisma.dmmf.datamodel.enums.find(
      (item) => item.name === 'GitabaseAnnotationKind',
    );

    expect(annotationKind?.values.map((value) => value.name)).toEqual([
      'highlight',
      'note',
    ]);
  });
});
