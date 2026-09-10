import { POLICY_VERSION, consentsAtRegistration } from './policy-version';

describe('consentsAtRegistration', () => {
  it('записывает оба согласия с версией политики', () => {
    expect(consentsAtRegistration('10.0.0.1')).toEqual([
      { kind: 'processing', policyVersion: POLICY_VERSION, grantedIp: '10.0.0.1' },
      { kind: 'cross_border', policyVersion: POLICY_VERSION, grantedIp: '10.0.0.1' },
    ]);
  });

  it('трансграничная передача — отдельное согласие, а не часть обработки', () => {
    // Копия уезжает за рубеж, и это отдельное действие: политика называет его
    // в разделе 5.1 отдельно, значит и согласие отдельное.
    expect(consentsAtRegistration().map((c) => c.kind)).toContain('cross_border');
  });

  it('версия политики выглядит датой и не пуста', () => {
    // Без версии согласие недоказуемо: текст мог смениться после него.
    expect(POLICY_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
