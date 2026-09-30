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
        kind: 'place',
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

  it('пробрасывает kind tour в place', async () => {
    const create = jest.fn().mockResolvedValue({ id: 'c1' });
    const listener = new ChatTravelMapListener({ create } as never);

    await listener.onGroupRequested({ ...event, kind: 'tour' });
    expect(create).toHaveBeenCalledWith('u1', {
      kind: 'group',
      visibility: 'public',
      title: 'Кафе',
      place: {
        id: 'p1',
        kind: 'tour',
        title: 'Кафе',
        kindLabel: 'Кафе',
        lat: 1,
        lng: 2,
        city: null,
      },
    });
  });

  describe('состав группы экскурсии', () => {
    const base = { conversationId: 'c1', guideId: 'g1', userId: 'u2' };

    it('joined зовёт addMembers от имени гида', async () => {
      const addMembers = jest.fn().mockResolvedValue({ added: 1 });
      const listener = new ChatTravelMapListener({ addMembers } as never);
      await listener.onTourMembership({ ...base, action: 'joined' });
      expect(addMembers).toHaveBeenCalledWith('g1', 'c1', ['u2']);
    });

    it('left зовёт removeMember от имени гида', async () => {
      const removeMember = jest.fn().mockResolvedValue({ ok: true });
      const listener = new ChatTravelMapListener({ removeMember } as never);
      await listener.onTourMembership({ ...base, action: 'left' });
      expect(removeMember).toHaveBeenCalledWith('g1', 'c1', 'u2');
    });

    it('ошибка не всплывает', async () => {
      const removeMember = jest.fn().mockRejectedValue(new Error('уже вышел'));
      const addMembers = jest.fn().mockRejectedValue(new Error('блок'));
      const listener = new ChatTravelMapListener({
        addMembers,
        removeMember,
      } as never);
      await expect(
        listener.onTourMembership({ ...base, action: 'left' }),
      ).resolves.toBeUndefined();
      await expect(
        listener.onTourMembership({ ...base, action: 'joined' }),
      ).resolves.toBeUndefined();
    });
  });
});
