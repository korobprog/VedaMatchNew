import { PrismaService } from '../../prisma/prisma.service';
import { ChatConversationsService } from './chat-conversations.service';
import { ChatEventsService } from './chat-events.service';
import { ChatPresenceService } from './chat-presence.service';

/**
 * Публичная карта отдаётся гостю без всякого токена, поэтому её состав —
 * не деталь реализации, а обещание приватности: наружу уходят организации и
 * не уходят люди. Тест держит именно это, а не форму ответа.
 */
describe('ChatConversationsService.publicMap', () => {
  const community = {
    id: 'community-1',
    slug: 'moscow',
    name: 'Община Москвы',
    city: 'Москва',
    location: { lat: 55.7558, lon: 37.6173 },
  };

  function build(communities: unknown[] = [community]) {
    const prisma = {
      community: { findMany: jest.fn(() => Promise.resolve(communities)) },
      chatConversation: {
        findMany: jest.fn(() =>
          Promise.resolve([
            { communityId: 'community-1', kind: 'channel' },
            { communityId: 'community-1', kind: 'group' },
            { communityId: 'community-1', kind: 'group' },
          ]),
        ),
      },
    };
    const service = new ChatConversationsService(
      prisma as unknown as PrismaService,
      {} as unknown as ChatEventsService,
      {} as never,
      {} as never,
      {} as unknown as ChatPresenceService,
    );
    return { prisma, service };
  }

  it('не отдаёт городов со счётчиком людей', async () => {
    const { service } = build();
    const state = await service.publicMap();
    // Ключа быть не должно вовсе: `cities: []` наружу — приглашение однажды
    // его наполнить, а согласие показываться люди давали своим.
    expect('cities' in state).toBe(false);
  });

  it('отдаёт общину с её координатами и числом открытых бесед', async () => {
    const { service } = build();
    const state = await service.publicMap();
    expect(state.communities).toEqual([
      {
        community: { id: 'community-1', slug: 'moscow', name: 'Община Москвы' },
        lat: 55.7558,
        lon: 37.6173,
        city: 'Москва',
        channels: 1,
        groups: 2,
      },
    ]);
  });

  it('берёт только действующие общины с указанным местом', async () => {
    const { prisma, service } = build();
    await service.publicMap();
    const [args] = prisma.community.findMany.mock.calls[0] as unknown as [
      { where: { status: string; location: unknown } },
    ];
    expect(args.where.status).toBe('active');
    expect(args.where.location).toBeDefined();
  });

  it('пропускает общину без координат, а не ставит её в океан', async () => {
    const { service } = build([{ ...community, location: { lat: 55.7 } }]);
    const state = await service.publicMap();
    expect(state.communities).toEqual([]);
  });
});
