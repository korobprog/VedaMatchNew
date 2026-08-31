import type { AccessTokenPayload } from '@vedamatch/shared';
import { MotivationBooksService } from './motivation-books.service';

const admin: AccessTokenPayload = {
  sub: 'admin-1',
  email: 'admin@example.com',
  role: 'admin',
};
const motivationServiceAdmin: AccessTokenPayload = {
  sub: 'sa-1',
  email: 'sa@example.com',
  role: 'service-admin',
  adminServices: ['motivation'],
};
const otherServiceAdmin: AccessTokenPayload = {
  sub: 'sa-2',
  email: 'sa2@example.com',
  role: 'service-admin',
  adminServices: ['music'],
};
const regularUser: AccessTokenPayload = {
  sub: 'user-1',
  email: 'user@example.com',
  role: 'user',
};

function setup() {
  const repository = {
    listBooksForQuoteMining: jest.fn().mockResolvedValue([
      {
        id: 'b1',
        slug: 'bg',
        title: 'Бхагавад-гита',
        author: 'Прабхупада',
        language: 'ru',
        kind: 'scripture',
      },
    ]),
    setBookKind: jest.fn(async (id: string, kind: string) => ({
      id,
      slug: 'lilamrita',
      title: 'Прабхупада-лиламрита',
      author: 'Прабхупада',
      language: 'ru',
      kind,
    })),
  };
  return {
    repository,
    service: new MotivationBooksService(repository as never),
  };
}

describe('MotivationBooksService', () => {
  it('lists books available for mining', async () => {
    const { service } = setup();

    await expect(service.list(admin)).resolves.toEqual([
      expect.objectContaining({ slug: 'bg', kind: 'scripture' }),
    ]);
  });

  it('marks a book as a biography so it stops being mined', async () => {
    const { service, repository } = setup();

    const updated = await service.setKind(admin, 'b2', 'biography');

    expect(repository.setBookKind).toHaveBeenCalledWith('b2', 'biography');
    expect(updated.kind).toBe('biography');
  });

  it('rejects an unknown kind', async () => {
    const { service, repository } = setup();

    await expect(
      service.setKind(admin, 'b2', 'novel' as never),
    ).rejects.toThrow('Unknown book kind');
    expect(repository.setBookKind).not.toHaveBeenCalled();
  });

  it('allows a service-admin scoped to motivation', async () => {
    const { service } = setup();

    await expect(service.list(motivationServiceAdmin)).resolves.toEqual([
      expect.objectContaining({ slug: 'bg', kind: 'scripture' }),
    ]);
  });

  it('requires an admin or service-admin role', async () => {
    const { service } = setup();

    await expect(service.list(regularUser)).rejects.toThrow();
    await expect(
      service.setKind(regularUser, 'b2', 'biography'),
    ).rejects.toThrow();
  });

  it('rejects a service-admin scoped to a different service', async () => {
    const { service } = setup();

    await expect(service.list(otherServiceAdmin)).rejects.toThrow();
    await expect(
      service.setKind(otherServiceAdmin, 'b2', 'biography'),
    ).rejects.toThrow();
  });
});
