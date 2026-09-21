import type { ChatChannelCommunity, ChatUserSummary } from '@vedamatch/shared';
import {
  buildCreateRequest,
  canCreateChannel,
  communityOptions,
  defaultChannelCommunityId,
  emptyGroupDraft,
  existingChannelsHint,
  filterPeople,
  findNameCollision,
  inactiveCommunityNote,
  nameCollisionText,
  shouldCheckNameCollision,
  toggleMember,
  validateGroupDraft,
  type GroupDraft,
} from './group-draft';

function draft(extra: Partial<GroupDraft> = {}): GroupDraft {
  return { ...emptyGroupDraft(), ...extra };
}

function community(
  id: string,
  name: string,
  status: ChatChannelCommunity['community']['status'] = 'active',
  channels: { id: string; title: string }[] = [],
): ChatChannelCommunity {
  return { community: { id, slug: id, name, status }, channels };
}

function person(id: string, name: string): ChatUserSummary {
  return { id, name };
}

describe('toggleMember', () => {
  it('добавляет человека в конец, когда он не отмечен', () => {
    expect(toggleMember(['a'], 'b')).toEqual(['a', 'b']);
  });

  it('снимает отметку повторным тапом', () => {
    expect(toggleMember(['a', 'b'], 'a')).toEqual(['b']);
  });

  it('не меняет исходный массив', () => {
    const selected = ['a'];
    toggleMember(selected, 'b');
    expect(selected).toEqual(['a']);
  });
});

describe('validateGroupDraft', () => {
  it('группа без названия — текст сервера про группу', () => {
    expect(validateGroupDraft(draft({ title: '   ' }))).toBe('У группы должно быть название');
  });

  it('канал без названия — текст сервера про канал', () => {
    expect(validateGroupDraft(draft({ mode: 'channel', title: '' }))).toBe('У канала должно быть название');
  });

  it('канал без общины не заводится', () => {
    expect(validateGroupDraft(draft({ mode: 'channel', title: 'Киртаны' }))).toBe('Выберите общину');
  });

  it('группа без общины — это личная группа, и она допустима', () => {
    expect(validateGroupDraft(draft({ title: 'Севаки' }))).toBeNull();
  });

  it('группа без участников допустима: позвать можно и потом', () => {
    expect(validateGroupDraft(draft({ title: 'Севаки', memberIds: [] }))).toBeNull();
  });

  it('канал с общиной и названием допустим', () => {
    expect(validateGroupDraft(draft({ mode: 'channel', title: 'Киртаны', communityId: 'c1' }))).toBeNull();
  });
});

describe('buildCreateRequest', () => {
  it('группа: обрезает пробелы, несёт участников и не шлёт пустую общину', () => {
    const request = buildCreateRequest(draft({ title: '  Севаки  ', memberIds: ['u1', 'u2'] }));
    expect(request).toEqual({ kind: 'group', title: 'Севаки', memberIds: ['u1', 'u2'] });
    expect(request.communityId).toBeUndefined();
  });

  it('группа общины: id общины уходит на сервер', () => {
    expect(buildCreateRequest(draft({ title: 'Севаки', communityId: 'c1' })).communityId).toBe('c1');
  });

  it('название режется до 80 символов, как на сервере', () => {
    const request = buildCreateRequest(draft({ title: 'я'.repeat(120) }));
    expect(request.title).toHaveLength(80);
  });

  it('канал: описание уходит обрезанным до 300 символов', () => {
    const request = buildCreateRequest(
      draft({ mode: 'channel', title: 'Киртаны', communityId: 'c1', description: `  ${'о'.repeat(400)}  ` }),
    );
    expect(request.kind).toBe('channel');
    expect(request.description).toHaveLength(300);
  });

  it('канал без описания не шлёт пустую строку', () => {
    const request = buildCreateRequest(draft({ mode: 'channel', title: 'Киртаны', communityId: 'c1', description: '  ' }));
    expect('description' in request).toBe(false);
  });

  it('канал не тащит с собой участников группы', () => {
    const request = buildCreateRequest(
      draft({ mode: 'channel', title: 'Киртаны', communityId: 'c1', memberIds: ['u1'] }),
    );
    expect(request.memberIds).toBeUndefined();
  });
});

describe('communityOptions', () => {
  it('разворачивает ответ сервера в плоский список с признаком активности', () => {
    expect(communityOptions([community('c1', 'Минская ятра'), community('c2', 'Тверь', 'pending')])).toEqual([
      { id: 'c1', name: 'Минская ятра', active: true },
      { id: 'c2', name: 'Тверь', active: false },
    ]);
  });
});

describe('defaultChannelCommunityId', () => {
  it('выбирает первую активную общину, пропуская неактивные', () => {
    expect(defaultChannelCommunityId([community('c2', 'Тверь', 'pending'), community('c1', 'Минск')])).toBe('c1');
  });

  it('активных нет — ничего не выбираем', () => {
    expect(defaultChannelCommunityId([community('c2', 'Тверь', 'pending')])).toBe('');
  });

  it('общин нет — пустая строка', () => {
    expect(defaultChannelCommunityId([])).toBe('');
  });
});

describe('canCreateChannel', () => {
  it('без общин вкладка «Канал» не показывается', () => {
    expect(canCreateChannel([])).toBe(false);
  });

  it('даже неактивная община даёт право завести канал — сервер решит', () => {
    expect(canCreateChannel([community('c2', 'Тверь', 'pending')])).toBe(true);
  });
});

describe('existingChannelsHint', () => {
  it('перечисляет уже заведённые каналы выбранной общины', () => {
    const hint = existingChannelsHint([community('c1', 'Минск', 'active', [{ id: 'k1', title: 'Объявления' }])], 'c1');
    expect(hint).toContain('«Объявления»');
  });

  it('каналов нет — подсказки нет', () => {
    expect(existingChannelsHint([community('c1', 'Минск')], 'c1')).toBeNull();
  });

  it('община не выбрана — подсказки нет', () => {
    expect(existingChannelsHint([community('c1', 'Минск', 'active', [{ id: 'k1', title: 'Объявления' }])], '')).toBeNull();
  });
});

describe('inactiveCommunityNote', () => {
  it('объясняет, почему неактивная община в списке есть, а выбрать её нельзя', () => {
    expect(inactiveCommunityNote([community('c2', 'Тверь', 'pending')])).toContain('на проверке');
  });

  it('все общины активны — объяснять нечего', () => {
    expect(inactiveCommunityNote([community('c1', 'Минск')])).toBeNull();
  });

  it('общин нет вовсе — тоже нечего', () => {
    expect(inactiveCommunityNote([])).toBeNull();
  });
});

describe('shouldCheckNameCollision', () => {
  it('личная группа с названием — спрашиваем справочник', () => {
    expect(shouldCheckNameCollision(draft({ title: 'Минская ятра' }))).toBe(true);
  });

  it('община уже выбрана — предупреждать не о чем', () => {
    expect(shouldCheckNameCollision(draft({ title: 'Минская ятра', communityId: 'c1' }))).toBe(false);
  });

  it('у канала община обязательна — тоже не спрашиваем', () => {
    expect(shouldCheckNameCollision(draft({ mode: 'channel', title: 'Минская ятра' }))).toBe(false);
  });

  it('пустое название искать нечего', () => {
    expect(shouldCheckNameCollision(draft({ title: '   ' }))).toBe(false);
  });
});

describe('findNameCollision', () => {
  const found = [{ name: 'Минская ятра' }, { name: 'Ятра Минска' }];

  it('точное совпадение находится без учёта регистра и пробелов', () => {
    expect(findNameCollision(found, '  минская ЯТРА ')).toBe('Минская ятра');
  });

  it('похожее название не считается совпадением', () => {
    expect(findNameCollision(found, 'Минская ятра севак')).toBeNull();
  });

  it('справочник пуст — совпадений нет', () => {
    expect(findNameCollision([], 'Минская ятра')).toBeNull();
  });

  it('пустой запрос ничего не находит, даже если в справочнике есть пустые имена', () => {
    expect(findNameCollision([{ name: '  ' }], '   ')).toBeNull();
  });
});

describe('nameCollisionText', () => {
  it('называет общину и объясняет, что привязки не произошло', () => {
    const text = nameCollisionText('Минская ятра');
    expect(text).toContain('«Минская ятра»');
    expect(text).toContain('не свяжется');
  });
});

describe('filterPeople', () => {
  const people = [person('u1', 'Радха Говинда дас'), person('u2', 'Мадхава'), person('u3', 'говиндини')];

  it('пустой запрос отдаёт весь список', () => {
    expect(filterPeople(people, '   ')).toHaveLength(3);
  });

  it('ищет подстроку без учёта регистра', () => {
    expect(filterPeople(people, 'ГОВИНД').map((p) => p.id)).toEqual(['u1', 'u3']);
  });

  it('ничего не найдено — пустой список, а не весь', () => {
    expect(filterPeople(people, 'нитай')).toEqual([]);
  });
});
