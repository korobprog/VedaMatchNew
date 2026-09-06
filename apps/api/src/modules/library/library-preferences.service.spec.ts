import { BadRequestException } from '@nestjs/common';
import { LibraryPreferencesService } from './library-preferences.service';

function prismaMock() {
  return {
    libraryPreference: {
      findUnique: jest.fn().mockResolvedValue(null),
      upsert: jest
        .fn()
        .mockImplementation(({ create }: { create: Record<string, unknown> }) =>
          Promise.resolve({
            uiLanguage: 'en',
            contentLanguages: [],
            ...create,
          }),
        ),
    },
  };
}

describe('LibraryPreferencesService', () => {
  it('defaults to russian when the user has no row yet', async () => {
    const service = new LibraryPreferencesService(prismaMock() as never);

    await expect(service.get('user-1')).resolves.toEqual({
      uiLanguage: 'ru',
      contentLanguages: [],
      lineage: null,
    });
  });

  it('rejects a lineage outside the shared list', async () => {
    const service = new LibraryPreferencesService(prismaMock() as never);

    await expect(
      service.update('user-1', { lineage: 'hare' as never }),
    ).rejects.toMatchObject({ response: { message: 'unsupported_lineage' } });
  });

  it('stores "all" and a concrete lineage, and reads garbage back as null', async () => {
    const prisma = prismaMock();
    const service = new LibraryPreferencesService(prisma as never);

    const all = await service.update('user-1', { lineage: 'all' });
    expect(all.lineage).toBe('all');
    expect(prisma.libraryPreference.upsert).toHaveBeenLastCalledWith(
      expect.objectContaining({ update: { lineage: 'all' } }),
    );

    prisma.libraryPreference.findUnique.mockResolvedValue({
      uiLanguage: 'ru',
      contentLanguages: [],
      lineage: 'retired-math',
    });
    expect((await service.get('user-1')).lineage).toBeNull();
  });

  it('rejects an unsupported ui language', async () => {
    const service = new LibraryPreferencesService(prismaMock() as never);

    await expect(
      service.update('user-1', { uiLanguage: 'de' as never }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('upserts the chosen locale', async () => {
    const prisma = prismaMock();
    const service = new LibraryPreferencesService(prisma as never);

    const result = await service.update('user-1', { uiLanguage: 'en' });

    expect(prisma.libraryPreference.upsert).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      create: {
        userId: 'user-1',
        uiLanguage: 'en',
        contentLanguages: [],
        lineage: null,
      },
      update: { uiLanguage: 'en' },
    });
    expect(result.uiLanguage).toBe('en');
  });
});
