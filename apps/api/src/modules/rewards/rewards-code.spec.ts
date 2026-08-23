import {
  REWARDS_CODE_ALPHABET,
  REWARDS_CODE_LENGTH,
  generateReferralCode,
  normalizeReferralCode,
} from './rewards-code';

describe('generateReferralCode', () => {
  it('отдаёт код нужной длины только из своего алфавита', () => {
    const code = generateReferralCode(Uint8Array.from([0, 1, 2, 3, 4, 5, 6]));
    expect(code).toHaveLength(REWARDS_CODE_LENGTH);
    for (const char of code) expect(REWARDS_CODE_ALPHABET).toContain(char);
  });

  it('не содержит букв и цифр, которые путают при диктовке', () => {
    for (const ambiguous of [
      '0',
      'O',
      '1',
      'I',
      'L',
      '5',
      'S',
      '8',
      'B',
      '2',
      'Z',
    ]) {
      expect(REWARDS_CODE_ALPHABET).not.toContain(ambiguous);
    }
  });

  // Главное свойство: байт от 250 и выше пропускается, иначе первые шесть
  // букв алфавита выпадали бы чаще остальных (256 % 25 = 6).
  it('пропускает байты, которые перекосили бы распределение', () => {
    const bytes = Uint8Array.from([
      250, 251, 252, 253, 254, 255, 0, 0, 0, 0, 0, 0, 0,
    ]);
    expect(generateReferralCode(bytes)).toBe(
      REWARDS_CODE_ALPHABET[0].repeat(7),
    );
  });

  it('падает, а не отдаёт короткий код, когда байтов не хватило', () => {
    expect(() => generateReferralCode(Uint8Array.from([1, 2]))).toThrow();
  });
});

describe('normalizeReferralCode', () => {
  it('приводит регистр и убирает разделители из диктовки', () => {
    expect(normalizeReferralCode(' acde-fgh ')).toBe('ACDEFGH');
  });

  it('отвергает не-строки, чужую длину и символы вне алфавита', () => {
    expect(normalizeReferralCode(null)).toBeNull();
    expect(normalizeReferralCode(42)).toBeNull();
    expect(normalizeReferralCode('ACDEFG')).toBeNull();
    expect(normalizeReferralCode('ACDEFGHJ')).toBeNull();
    // `O` в алфавит не входит: подменять её на `0` нельзя — угадав неверно,
    // привязали бы человека к чужому пригласившему.
    expect(normalizeReferralCode('ACDEFGO')).toBeNull();
  });
});
