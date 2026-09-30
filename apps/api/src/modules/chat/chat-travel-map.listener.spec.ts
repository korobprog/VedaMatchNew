import { ChatTravelMapListener } from './chat-travel-map.listener';

describe('ChatTravelMapListener', () => {
  const event = {
    requesterId: 'u1',
    placeId: 'p1',
    title: 'Кафе',
    kindLabel: 'Кафе',
    lat: 1,
    lng: 2,
    city: null,
  };

  it('заводит открытую группу места и возвращает id', async () => {
    const create = jest.fn().mockResolvedValue({ id: 'c1' });
    const listener = new ChatTravelMapListener({ create } as never);

    await expect(listener.onGroupRequested(event)).resolves.toBe('c1');
    expect(create).toHaveBeenCalledWith('u1', {
      kind: 'group',
      visibility: 'public',
      title: 'Кафе',
      place: {
        id: 'p1',
        title: 'Кафе',
        kindLabel: 'Кафе',
        lat: 1,
        lng: 2,
        city: null,
      },
    });
  });

  it('при ошибке возвращает null, а не рвёт шину', async () => {
    const create = jest.fn().mockRejectedValue(new Error('нельзя'));
    const listener = new ChatTravelMapListener({ create } as never);

    await expect(listener.onGroupRequested(event)).resolves.toBeNull();
  });
});
