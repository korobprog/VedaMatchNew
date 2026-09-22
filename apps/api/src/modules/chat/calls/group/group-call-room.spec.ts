import {
  GROUP_CALL_MAX_PARTICIPANTS,
  GROUP_CALL_PARTICIPANT_TTL_MS,
  groupCallSummaryBody,
  hostOf,
  isAlive,
  joinDecision,
  liveCallByConversation,
  liveParticipants,
  meshConnectionCount,
  offerTargets,
  peersOf,
  shouldEndRoom,
  staleParticipants,
  type RoomParticipant,
} from './group-call-room';

const NOW = 1_700_000_000_000;

function p(
  userId: string,
  joinedAtOffset: number,
  lastSeenOffset = 0,
): RoomParticipant {
  return {
    userId,
    joinedAt: NOW + joinedAtOffset,
    lastSeenAt: NOW + lastSeenOffset,
    muted: false,
  };
}

describe('живость участника', () => {
  it('свежий heartbeat — жив, протухший — нет', () => {
    expect(isAlive(p('a', -1000, -1000), NOW)).toBe(true);
    expect(isAlive(p('a', -1000, -GROUP_CALL_PARTICIPANT_TTL_MS), NOW)).toBe(
      true,
    );
    expect(
      isAlive(p('a', -1000, -GROUP_CALL_PARTICIPANT_TTL_MS - 1), NOW),
    ).toBe(false);
  });

  it('отделяет мёртвых от живых', () => {
    const list = [
      p('a', -3000),
      p('b', -2000, -GROUP_CALL_PARTICIPANT_TTL_MS - 1),
    ];
    expect(liveParticipants(list, NOW).map((x) => x.userId)).toEqual(['a']);
    expect(staleParticipants(list, NOW).map((x) => x.userId)).toEqual(['b']);
  });
});

describe('порядок и хозяин комнаты', () => {
  it('порядок — по времени входа, при равенстве — по id', () => {
    const list = [p('c', -100), p('a', -300), p('b', -300)];
    expect(liveParticipants(list, NOW).map((x) => x.userId)).toEqual([
      'a',
      'b',
      'c',
    ]);
  });

  it('хозяин — самый ранний из живых', () => {
    expect(hostOf([p('c', -100), p('a', -300)], NOW)).toBe('a');
  });

  it('хозяин вышел — роль переходит следующему, комната живёт', () => {
    const afterHostLeft = [p('b', -200), p('c', -100)];
    expect(hostOf(afterHostLeft, NOW)).toBe('b');
    expect(shouldEndRoom(afterHostLeft, NOW)).toBe(false);
  });

  it('хозяин пропал по сети — роль переходит, он не остаётся хозяином мёртвым', () => {
    const list = [
      p('a', -300, -GROUP_CALL_PARTICIPANT_TTL_MS - 1),
      p('b', -200),
    ];
    expect(hostOf(list, NOW)).toBe('b');
  });

  it('живых не осталось — хозяина нет и комнату пора закрывать', () => {
    const dead = [p('a', -300, -GROUP_CALL_PARTICIPANT_TTL_MS - 1)];
    expect(hostOf(dead, NOW)).toBeNull();
    expect(shouldEndRoom(dead, NOW)).toBe(true);
    expect(shouldEndRoom([], NOW)).toBe(true);
  });
});

describe('потолок участников', () => {
  it('потолок — ровно четыре', () => {
    expect(GROUP_CALL_MAX_PARTICIPANTS).toBe(4);
  });

  it('пятого не пускает', () => {
    const four = ['a', 'b', 'c', 'd'].map((id, i) => p(id, -400 + i * 100));
    expect(joinDecision(four, 'e', NOW)).toEqual({
      kind: 'deny',
      reason: 'full',
    });
  });

  it('четвёртого пускает', () => {
    const three = ['a', 'b', 'c'].map((id, i) => p(id, -300 + i * 100));
    expect(joinDecision(three, 'd', NOW)).toEqual({ kind: 'join' });
  });

  it('место мёртвого участника достаётся новому — комната не залипает «полной»', () => {
    const four = ['a', 'b', 'c'].map((id, i) => p(id, -400 + i * 100));
    four.push(p('d', -100, -GROUP_CALL_PARTICIPANT_TTL_MS - 1));
    expect(joinDecision(four, 'e', NOW)).toEqual({ kind: 'join' });
  });

  it('тот, кто уже в комнате, входит повторно без отказа даже при полной комнате', () => {
    const four = ['a', 'b', 'c', 'd'].map((id, i) => p(id, -400 + i * 100));
    expect(joinDecision(four, 'b', NOW)).toEqual({ kind: 'rejoin' });
  });

  it('в закрытую комнату не пускает', () => {
    expect(joinDecision([], 'a', NOW, 'ended')).toEqual({
      kind: 'deny',
      reason: 'ended',
    });
  });
});

describe('кто с кем соединяется (mesh)', () => {
  it('позже вошедший делает offer всем, кто был раньше', () => {
    const list = [p('a', -300), p('b', -200), p('c', -100)];
    expect(offerTargets(list, 'c', NOW)).toEqual(['a', 'b']);
    expect(offerTargets(list, 'b', NOW)).toEqual(['a']);
    expect(offerTargets(list, 'a', NOW)).toEqual([]);
  });

  it('в каждой паре offer делает ровно один — glare невозможен', () => {
    const list = [p('a', -300), p('b', -200), p('c', -100), p('d', -50)];
    const ids = list.map((x) => x.userId);
    for (const one of ids)
      for (const other of ids) {
        if (one === other) continue;
        const oneOffers = offerTargets(list, one, NOW).includes(other);
        const otherOffers = offerTargets(list, other, NOW).includes(one);
        expect(oneOffers !== otherOffers).toBe(true);
      }
  });

  it('мёртвый участник не попадает ни в цели offer, ни в список соединений', () => {
    const list = [
      p('a', -300),
      p('b', -200, -GROUP_CALL_PARTICIPANT_TTL_MS - 1),
      p('c', -100),
    ];
    expect(offerTargets(list, 'c', NOW)).toEqual(['a']);
    expect(peersOf(list, 'c', NOW)).toEqual(['a']);
  });

  it('тот, кого в комнате нет, никому не звонит', () => {
    expect(offerTargets([p('a', -300)], 'z', NOW)).toEqual([]);
  });

  it('каждый держит соединение со всеми, кроме себя', () => {
    const list = [p('a', -300), p('b', -200), p('c', -100)];
    expect(peersOf(list, 'b', NOW)).toEqual(['a', 'c']);
  });

  it('число связей растёт квадратично — потому потолок и нужен', () => {
    expect(meshConnectionCount(1)).toBe(0);
    expect(meshConnectionCount(2)).toBe(1);
    expect(meshConnectionCount(3)).toBe(3);
    expect(meshConnectionCount(4)).toBe(6);
    expect(meshConnectionCount(5)).toBe(10);
  });
});

describe('подпись в ленте', () => {
  it('склоняет «участник» и показывает длительность', () => {
    expect(groupCallSummaryBody(1, 30)).toBe(
      'Групповой звонок · 1 участник · 30 с',
    );
    expect(groupCallSummaryBody(3, 125)).toBe(
      'Групповой звонок · 3 участника · 2 мин 5 с',
    );
    expect(groupCallSummaryBody(5, 60)).toBe(
      'Групповой звонок · 5 участников · 1 мин 0 с',
    );
    expect(groupCallSummaryBody(11, 0)).toBe(
      'Групповой звонок · 11 участников · 0 с',
    );
  });

  it('никого не было — звонок не состоялся', () => {
    expect(groupCallSummaryBody(0, 0)).toBe('Групповой звонок не состоялся');
  });
});

/**
 * «Идёт звонок» в списке бесед. Считается по живым участникам, а не по
 * статусу строки: комната остаётся `live` до ближайшей уборки, и отметка на
 * замолчавшей комнате уводила бы человека в пустой звонок.
 */
describe('где идёт разговор', () => {
  const room = (
    id: string,
    conversationId: string,
    participants: RoomParticipant[],
  ) => ({ id, conversationId, participants });

  it('называет комнату, в которой кто-то есть', () => {
    expect([
      ...liveCallByConversation([room('r1', 'c1', [p('a', 0)])], NOW),
    ]).toEqual([['c1', 'r1']]);
  });

  it('комнату, где все протухли, звонком не считает', () => {
    expect(
      liveCallByConversation(
        [room('r1', 'c1', [p('a', 0, -GROUP_CALL_PARTICIPANT_TTL_MS - 1)])],
        NOW,
      ).size,
    ).toBe(0);
  });

  it('комнату без участников звонком не считает', () => {
    expect(liveCallByConversation([room('r1', 'c1', [])], NOW).size).toBe(0);
  });

  it('разводит беседы по своим комнатам', () => {
    const map = liveCallByConversation(
      [room('r1', 'c1', [p('a', 0)]), room('r2', 'c2', [p('b', 0)])],
      NOW,
    );
    expect(map.get('c1')).toBe('r1');
    expect(map.get('c2')).toBe('r2');
  });

  it('при двух живых комнатах в беседе берёт последнюю', () => {
    expect(
      liveCallByConversation(
        [room('r1', 'c1', [p('a', 0)]), room('r2', 'c1', [p('b', 0)])],
        NOW,
      ).get('c1'),
    ).toBe('r2');
  });

  it('мёртвая комната не перебивает живую', () => {
    expect(
      liveCallByConversation(
        [
          room('r1', 'c1', [p('a', 0)]),
          room('r2', 'c1', [p('b', 0, -GROUP_CALL_PARTICIPANT_TTL_MS - 1)]),
        ],
        NOW,
      ).get('c1'),
    ).toBe('r1');
  });
});
