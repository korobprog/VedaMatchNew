import { POLICY_VERSION, consentsAtRegistration } from './policy-version';

describe('consentsAtRegistration', () => {
  it('записывает согласие на обработку с версией политики', () => {
    expect(consentsAtRegistration('10.0.0.1')).toEqual([
      { kind: 'processing', policyVersion: POLICY_VERSION, grantedIp: '10.0.0.1' },
    ]);
  });

  it('не записывает согласие на передачу за рубеж', () => {
    // Политика пока не сообщает ни места хранения, ни того, что копия уезжает
    // за границу. Согласие на несказанное — хуже, чем его отсутствие.
    expect(consentsAtRegistration().map((c) => c.kind)).not.toContain('cross_border');
  });

  it('версия политики выглядит датой и не пуста', () => {
    // Без версии согласие недоказуемо: текст мог смениться после него.
    expect(POLICY_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
