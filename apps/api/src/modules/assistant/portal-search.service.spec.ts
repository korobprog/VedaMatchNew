import { PortalSearchService } from './portal-search.service';
import { PORTAL_SEARCH_SOURCES } from './portal-search';

const actor = {
  sub: 'u1',
  email: 'u1@example.com',
  role: 'user',
} as never;

function toolsMock(
  answer: (tool: string) => unknown = () => ({ ok: true, items: [] }),
) {
  return {
    invoke: jest.fn((tool: { name: string }) =>
      Promise.resolve(answer(tool.name)),
    ),
  };
}

describe('PortalSearchService', () => {
  it('спрашивает все сервисы из списка сразу, без журнала и с коротким таймаутом', async () => {
    const tools = toolsMock();
    const service = new PortalSearchService(tools as never);

    await service.search(actor, '  гита ');

    expect(tools.invoke.mock.calls.map(([tool]) => tool.name)).toEqual(
      PORTAL_SEARCH_SOURCES.map((source) => source.tool),
    );
    // Мок объявлен с одним параметром, а сервис передаёт пять — вызовы
    // читаются как есть, через unknown.
    const calls = tools.invoke.mock.calls as unknown as [
      unknown,
      unknown,
      unknown,
      unknown,
      unknown,
    ][];
    for (const [, args, , locale, options] of calls) {
      expect(args).toEqual({ query: 'гита', limit: 5 });
      expect(locale).toBe('ru');
      expect(options).toEqual({ record: false, timeoutMs: 5000 });
    }
  });

  it('слишком короткий запрос в сервисы не уходит', async () => {
    const tools = toolsMock();
    const service = new PortalSearchService(tools as never);

    await expect(service.search(actor, 'я')).resolves.toEqual({
      query: null,
      groups: [],
      unavailable: [],
    });
    expect(tools.invoke).not.toHaveBeenCalled();
  });

  it('собирает находки сервисов в группы', async () => {
    const tools = toolsMock((tool) =>
      tool === 'music_search'
        ? { ok: true, items: [{ title: 'Киртан', href: '/music/tracks/1' }] }
        : { ok: true, items: [] },
    );
    const service = new PortalSearchService(tools as never);

    const result = await service.search(actor, 'киртан');

    expect(result.groups).toEqual([
      {
        service: 'music',
        items: [expect.objectContaining({ title: 'Киртан' })],
      },
    ]);
  });
});
