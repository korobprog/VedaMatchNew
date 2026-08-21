import {
  describeAuditAction,
  describeAuditDetails,
  isKnownAuditAction,
} from './admin-audit-copy';

describe('describeAuditAction', () => {
  it('переводит действие в человеческую фразу', () => {
    expect(describeAuditAction('user.blocked')).toBe('Аккаунт заблокирован');
    expect(describeAuditAction('billing.mode-changed')).toBe(
      'Изменён режим биллинга',
    );
  });
});

describe('describeAuditDetails', () => {
  it('пустые подробности дают пустую строку', () => {
    expect(describeAuditDetails(null)).toBe('');
    expect(describeAuditDetails({})).toBe('');
  });

  it('подписывает известные ключи', () => {
    expect(describeAuditDetails({ from: 'user', to: 'admin' })).toBe(
      'было: user · стало: admin',
    );
  });

  it('неизвестный ключ показывает как есть', () => {
    expect(describeAuditDetails({ mode: 'beta' })).toBe('mode: beta');
  });

  it('выбрасывает пустые значения, а не рисует прочерк', () => {
    expect(describeAuditDetails({ reason: null, to: 'admin', note: '' })).toBe(
      'стало: admin',
    );
  });

  it('сохраняет числа и логические значения', () => {
    expect(describeAuditDetails({ recipients: 13, important: true })).toBe(
      'получателей: 13 · important: true',
    );
  });
});

describe('isKnownAuditAction', () => {
  it('пропускает известное действие', () => {
    expect(isKnownAuditAction('user.role-changed')).toBe(true);
  });

  it('отсекает чужое значение: в журнал не должно попасть что попало', () => {
    expect(isKnownAuditAction('user.something-else')).toBe(false);
    expect(isKnownAuditAction('constructor')).toBe(false);
  });
});
