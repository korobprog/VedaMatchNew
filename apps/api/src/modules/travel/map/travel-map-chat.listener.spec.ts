import { TravelMapChatListener } from './travel-map-chat.listener';
import type { TravelMapService } from './travel-map.service';

function setup() {
  const map = {
    searchSnapshots: jest.fn().mockResolvedValue([]),
    linkConversation: jest.fn().mockResolvedValue(undefined),
  };
  return {
    map,
    listener: new TravelMapChatListener(map as unknown as TravelMapService),
  };
}

describe('TravelMapChatListener', () => {
  it('привязку чужого сервиса игнорирует', async () => {
    const { map, listener } = setup();
    await listener.onLinked({
      service: 'market',
      contextId: 'p1',
      conversationId: 'c1',
    });
    expect(map.linkConversation).not.toHaveBeenCalled();
  });

  it('привязку своего сервиса передаёт в сервис', async () => {
    const { map, listener } = setup();
    await listener.onLinked({
      service: 'travel-map',
      contextId: 'p1',
      conversationId: 'c1',
    });
    expect(map.linkConversation).toHaveBeenCalledWith('p1', 'c1');
  });

  it('поиск отдаёт ответ сервиса', async () => {
    const { map, listener } = setup();
    await listener.onSearch({ q: 'мос', limit: 5 });
    expect(map.searchSnapshots).toHaveBeenCalledWith('мос', 5);
  });
});
