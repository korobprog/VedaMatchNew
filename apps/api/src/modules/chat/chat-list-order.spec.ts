import { compareChatListItems, sortChatList } from './chat-list-order';

function item(
  id: string,
  lastMessageAt: string | null,
  over: { pinned?: boolean; official?: boolean } = {},
) {
  return { id, lastMessageAt, pinned: false, official: false, ...over };
}

describe('порядок списка бесед (VED-308)', () => {
  it('самое свежее сообщение сверху, дальше по убыванию', () => {
    const list = [
      item('a', '2026-09-20T10:00:00.000Z'),
      item('b', '2026-09-21T14:06:00.000Z'),
      item('c', '2026-09-21T09:00:00.000Z'),
    ];
    expect(sortChatList(list).map((c) => c.id)).toEqual(['b', 'c', 'a']);
  });

  it('беседы без сообщений идут после переписки, а не над ней', () => {
    const list = [
      item('empty-1', null),
      item('empty-2', null),
      item('talk', '2026-09-01T10:00:00.000Z'),
    ];
    expect(sortChatList(list).map((c) => c.id)).toEqual([
      'talk',
      'empty-1',
      'empty-2',
    ]);
  });

  it('пустые между собой сохраняют порядок запроса (по дате создания)', () => {
    const list = [item('newer', null), item('older', null)];
    expect(sortChatList(list).map((c) => c.id)).toEqual(['newer', 'older']);
    expect(compareChatListItems(list[0], list[1])).toBe(0);
  });

  it('официальный канал первым, затем закреплённые — даже пустые и старые', () => {
    const list = [
      item('fresh', '2026-09-21T14:06:00.000Z'),
      item('pinned-old', '2026-01-01T00:00:00.000Z', { pinned: true }),
      item('official-empty', null, { official: true }),
      item('pinned-fresh', '2026-09-21T12:00:00.000Z', { pinned: true }),
    ];
    expect(sortChatList(list).map((c) => c.id)).toEqual([
      'official-empty',
      'pinned-fresh',
      'pinned-old',
      'fresh',
    ]);
  });

  it('новое сообщение поднимает беседу из пустых на самый верх', () => {
    const before = [
      item('empty', null),
      item('talk', '2026-09-21T14:06:00.000Z'),
    ];
    const after = before.map((c) =>
      c.id === 'empty'
        ? { ...c, lastMessageAt: '2026-09-21T15:00:00.000Z' }
        : c,
    );
    expect(sortChatList(before).map((c) => c.id)).toEqual(['talk', 'empty']);
    expect(sortChatList(after).map((c) => c.id)).toEqual(['empty', 'talk']);
  });

  it('битая дата считается пустой, а не ломает сортировку', () => {
    const list = [
      item('bad', 'не дата'),
      item('ok', '2026-09-21T10:00:00.000Z'),
    ];
    expect(sortChatList(list).map((c) => c.id)).toEqual(['ok', 'bad']);
  });

  it('не трогает исходный массив', () => {
    const list = [item('a', null), item('b', '2026-09-21T10:00:00.000Z')];
    sortChatList(list);
    expect(list.map((c) => c.id)).toEqual(['a', 'b']);
  });
});
