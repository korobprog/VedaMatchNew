import { referralLevel, referralPayouts } from './rewards-levels';

const NOMINALS = { levelOnePoints: 30, levelTwoPoints: 5 };

describe('referralPayouts', () => {
  it('платит только пригласившему, когда над ним никого нет', () => {
    expect(
      referralPayouts(
        { inviteeId: 'b', inviterId: 'a', grandInviterId: null },
        NOMINALS,
      ),
    ).toEqual([{ userId: 'a', level: 1, points: 30 }]);
  });

  it('платит оба уровня по цепочке A → B → C', () => {
    expect(
      referralPayouts(
        { inviteeId: 'c', inviterId: 'b', grandInviterId: 'a' },
        NOMINALS,
      ),
    ).toEqual([
      { userId: 'b', level: 1, points: 30 },
      { userId: 'a', level: 2, points: 5 },
    ]);
  });

  // Глубже второго уровня начислений нет: цепочка обрывается на деде, и
  // прадед в расчёт вообще не попадает — его здесь просто нечем передать.
  it('не знает про третий уровень', () => {
    const payouts = referralPayouts(
      { inviteeId: 'd', inviterId: 'c', grandInviterId: 'b' },
      NOMINALS,
    );
    expect(payouts.map((p) => p.userId)).toEqual(['c', 'b']);
  });

  it('не платит самому себе при цикле в цепочке', () => {
    expect(
      referralPayouts(
        { inviteeId: 'a', inviterId: 'a', grandInviterId: null },
        NOMINALS,
      ),
    ).toEqual([]);
    expect(
      referralPayouts(
        { inviteeId: 'b', inviterId: 'a', grandInviterId: 'b' },
        NOMINALS,
      ),
    ).toEqual([{ userId: 'a', level: 1, points: 30 }]);
  });

  it('не платит деду, совпадающему с отцом', () => {
    expect(
      referralPayouts(
        { inviteeId: 'c', inviterId: 'a', grandInviterId: 'a' },
        NOMINALS,
      ),
    ).toEqual([{ userId: 'a', level: 1, points: 30 }]);
  });

  it('обнулённый в админке номинал убирает уровень целиком', () => {
    expect(
      referralPayouts(
        { inviteeId: 'c', inviterId: 'b', grandInviterId: 'a' },
        { levelOnePoints: 30, levelTwoPoints: 0 },
      ),
    ).toEqual([{ userId: 'b', level: 1, points: 30 }]);
    expect(
      referralPayouts(
        { inviteeId: 'c', inviterId: 'b', grandInviterId: 'a' },
        { levelOnePoints: 0, levelTwoPoints: 0 },
      ),
    ).toEqual([]);
  });
});

describe('referralLevel', () => {
  // a → b → c → d
  const parents = new Map([
    ['b', 'a'],
    ['c', 'b'],
    ['d', 'c'],
  ]);

  it('различает своих и внуков', () => {
    expect(referralLevel('a', 'b', parents)).toBe(1);
    expect(referralLevel('a', 'c', parents)).toBe(2);
  });

  it('не видит третий уровень', () => {
    expect(referralLevel('a', 'd', parents)).toBeNull();
  });

  it('отдаёт null для чужих и для пришедших сами', () => {
    expect(referralLevel('z', 'c', parents)).toBeNull();
    expect(referralLevel('a', 'a', parents)).toBeNull();
  });
});
