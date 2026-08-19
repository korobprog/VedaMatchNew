import { BadRequestException } from '@nestjs/common';
import {
  parseStoredRequisites,
  toPublicDonation,
  validateRequisites,
} from './donation';

describe('parseStoredRequisites', () => {
  it('drops anything that does not look like a requisite', () => {
    expect(
      parseStoredRequisites([
        { kind: 'card', label: ' Карта ', value: ' 2200 0000 ' },
        { kind: 'paypal', label: 'x', value: 'y' },
        { kind: 'sbp', label: '', value: '+7' },
        'junk',
        null,
      ]),
    ).toEqual([{ kind: 'card', label: 'Карта', value: '2200 0000' }]);
  });

  it('returns nothing for non-arrays', () => {
    expect(parseStoredRequisites(null)).toEqual([]);
    expect(parseStoredRequisites({ kind: 'card' })).toEqual([]);
  });
});

describe('validateRequisites', () => {
  it('trims and keeps valid entries', () => {
    expect(
      validateRequisites([
        { kind: 'link', label: ' Boosty ', value: 'https://boosty.to/x ' },
      ]),
    ).toEqual([
      { kind: 'link', label: 'Boosty', value: 'https://boosty.to/x' },
    ]);
  });

  it.each([
    [[{ kind: 'card', label: '', value: '1' }], 'подпись'],
    [[{ kind: 'card', label: 'x', value: '' }], 'значение'],
    [[{ kind: 'nope', label: 'x', value: '1' }], 'вид'],
    [[{ kind: 'link', label: 'x', value: 'http://insecure' }], 'https'],
    ['not a list', 'списком'],
  ])('rejects %j', (input, fragment) => {
    expect(() => validateRequisites(input)).toThrow(BadRequestException);
    expect(() => validateRequisites(input)).toThrow(fragment);
  });
});

describe('toPublicDonation', () => {
  it('hides everything when disabled or empty', () => {
    // Включено без реквизитов — показывать нечего, кнопки быть не должно.
    expect(
      toPublicDonation({
        donationEnabled: true,
        donationText: 'Спасибо',
        donationRequisites: [],
      }),
    ).toEqual({ enabled: false, text: '', requisites: [] });
    expect(
      toPublicDonation({
        donationEnabled: false,
        donationText: 'Спасибо',
        donationRequisites: [{ kind: 'card', label: 'Карта', value: '1' }],
      }),
    ).toEqual({ enabled: false, text: '', requisites: [] });
    expect(toPublicDonation(null).enabled).toBe(false);
  });

  it('exposes text and requisites when enabled', () => {
    expect(
      toPublicDonation({
        donationEnabled: true,
        donationText: null,
        donationRequisites: [{ kind: 'sbp', label: 'СБП', value: '+7 900' }],
      }),
    ).toEqual({
      enabled: true,
      text: '',
      requisites: [{ kind: 'sbp', label: 'СБП', value: '+7 900' }],
    });
  });
});
