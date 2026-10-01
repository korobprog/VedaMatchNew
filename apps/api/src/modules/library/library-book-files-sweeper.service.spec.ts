/* Уборка брошенных файлов книг. */
import { LibraryBookFilesSweeperService } from './library-book-files-sweeper.service';

const NOW = new Date('2026-09-30T12:00:00.000Z');
const OLD = new Date('2026-09-30T08:00:00.000Z');
const FRESH = new Date('2026-09-30T11:30:00.000Z');
const key = (id: number) =>
  `library/books/entry-1/${String(id).padStart(8, '0')}-d9cb-469f-a165-70867728950e.pdf`;

function setup(
  objects: Array<{ key: string; lastModified: Date | null }>,
  known: string[] = [],
  configured = true,
) {
  const prisma = {
    libraryEntryFile: {
      findMany: jest
        .fn()
        .mockResolvedValue(known.map((storageKey) => ({ storageKey }))),
    },
  };
  const storage = {
    configured,
    list: jest.fn().mockResolvedValue(objects),
    remove: jest.fn().mockResolvedValue(true),
  };
  const config = { get: jest.fn().mockReturnValue(undefined) };
  const service = new LibraryBookFilesSweeperService(
    prisma as never,
    storage as never,
    config as never,
  );
  return { prisma, storage, service };
}

describe('LibraryBookFilesSweeperService', () => {
  it('убирает только старые объекты без строки в базе', async () => {
    const { service, storage } = setup(
      [
        { key: key(1), lastModified: OLD },
        { key: key(2), lastModified: OLD },
        { key: key(3), lastModified: FRESH },
      ],
      [key(2)],
    );

    await expect(service.sweep(NOW)).resolves.toEqual([key(1)]);
    expect(storage.list).toHaveBeenCalledWith('library/books/');
    expect(storage.remove).toHaveBeenCalledTimes(1);
    expect(storage.remove).toHaveBeenCalledWith(key(1));
  });

  it('за один заход убирает не больше сотни', async () => {
    const objects = Array.from({ length: 150 }, (_, index) => ({
      key: key(index),
      lastModified: OLD,
    }));
    const { service, storage } = setup(objects);

    await expect(service.sweep(NOW)).resolves.toHaveLength(100);
    expect(storage.remove).toHaveBeenCalledTimes(100);
  });

  it('объект, который не удалился, удалённым не считает', async () => {
    const { service, storage } = setup([{ key: key(1), lastModified: OLD }]);
    storage.remove.mockResolvedValue(false);

    await expect(service.sweep(NOW)).resolves.toEqual([]);
  });

  it('без хранилища тик пустой', async () => {
    const { service, storage } = setup(
      [{ key: key(1), lastModified: OLD }],
      [],
      false,
    );

    await service.tick(NOW);

    expect(storage.list).not.toHaveBeenCalled();
    expect(storage.remove).not.toHaveBeenCalled();
  });

  it('сбой обхода бакета не роняет процесс', async () => {
    const { service, storage } = setup([]);
    storage.list.mockRejectedValue(new Error('s3 down'));

    await expect(service.tick(NOW)).resolves.toBeUndefined();
    expect(storage.remove).not.toHaveBeenCalled();
  });
});
