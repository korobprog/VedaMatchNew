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
    });
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
      create: { userId: 'user-1', uiLanguage: 'en', contentLanguages: [] },
      update: { uiLanguage: 'en' },
    });
    expect(result.uiLanguage).toBe('en');
  });
});
