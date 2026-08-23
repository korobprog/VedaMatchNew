import {
  balanceFromLedger,
  revokedIds,
  type LedgerRow,
} from './rewards-balance';

function row(
  patch: Partial<LedgerRow> & Pick<LedgerRow, 'id' | 'type' | 'amount'>,
): LedgerRow {
  return { revokesId: null, ...patch };
}

describe('balanceFromLedger', () => {
  it('пустой леджер — нулевой баланс', () => {
    expect(balanceFromLedger([])).toEqual({
      total: 0,
      reserved: 0,
      available: 0,
    });
  });

  it('складывает начисления беты', () => {
    const balance = balanceFromLedger([
      row({ id: '1', type: 'welcome', amount: 10 }),
      row({ id: '2', type: 'referral_l1', amount: 30 }),
      row({ id: '3', type: 'referral_l2', amount: 5 }),
    ]);
    expect(balance).toEqual({ total: 45, reserved: 0, available: 45 });
  });

  it('вычитает отмену администратора', () => {
    const balance = balanceFromLedger([
      row({ id: '1', type: 'referral_l1', amount: 30 }),
      row({ id: '2', type: 'admin_revoke', amount: -30, revokesId: '1' }),
    ]);
    expect(balance.total).toBe(0);
  });

  // Резерв держит сумму, но не тратит её: до подтверждения оплаты баллы
  // остаются на балансе и одновременно недоступны.
  it('открытый резерв уменьшает доступное, но не баланс', () => {
    const balance = balanceFromLedger([
      row({ id: '1', type: 'referral_l1', amount: 30 }),
      row({ id: '2', type: 'reserve', amount: -20 }),
    ]);
    expect(balance).toEqual({ total: 30, reserved: 20, available: 10 });
  });

  it('возврат закрывает резерв и возвращает доступное', () => {
    const balance = balanceFromLedger([
      row({ id: '1', type: 'referral_l1', amount: 30 }),
      row({ id: '2', type: 'reserve', amount: -20 }),
      row({ id: '3', type: 'release', amount: 0, revokesId: '2' }),
    ]);
    expect(balance).toEqual({ total: 30, reserved: 0, available: 30 });
  });

  it('подтверждение превращает резерв в трату ровно один раз', () => {
    const balance = balanceFromLedger([
      row({ id: '1', type: 'referral_l1', amount: 30 }),
      row({ id: '2', type: 'reserve', amount: -20 }),
      row({ id: '3', type: 'commit', amount: -20, revokesId: '2' }),
    ]);
    expect(balance).toEqual({ total: 10, reserved: 0, available: 10 });
  });

  it('несколько резервов складываются', () => {
    const balance = balanceFromLedger([
      row({ id: '1', type: 'welcome', amount: 100 }),
      row({ id: '2', type: 'reserve', amount: -20 }),
      row({ id: '3', type: 'reserve', amount: -30 }),
      row({ id: '4', type: 'release', amount: 0, revokesId: '2' }),
    ]);
    expect(balance).toEqual({ total: 100, reserved: 30, available: 70 });
  });

  it('не показывает отрицательный баланс', () => {
    const balance = balanceFromLedger([
      row({ id: '1', type: 'admin_revoke', amount: -30, revokesId: 'x' }),
    ]);
    expect(balance.total).toBe(0);
    expect(balance.available).toBe(0);
  });
});

describe('revokedIds', () => {
  it('отмечает отменённые строки, не трогая закрытые резервы', () => {
    const ids = revokedIds([
      row({ id: '1', type: 'referral_l1', amount: 30 }),
      row({ id: '2', type: 'admin_revoke', amount: -30, revokesId: '1' }),
      row({ id: '3', type: 'reserve', amount: -10 }),
      row({ id: '4', type: 'release', amount: 0, revokesId: '3' }),
    ]);
    expect([...ids]).toEqual(['1']);
  });
});
