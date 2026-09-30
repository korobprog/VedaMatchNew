import { BadRequestException } from '@nestjs/common';
import { parseGuideInput } from './guide-input';

describe('parseGuideInput', () => {
  it('нормализует поля и схлопывает дубли', () => {
    const out = parseGuideInput({
      about: '  Вожу по Вриндавану ',
      languages: ['ru', ' ru ', 'en'],
      cities: ['Вриндаван'],
      telegram: 'https://t.me/guide_1',
      phone: ' +7 900 ',
    });
    expect(out).toEqual({
      about: 'Вожу по Вриндавану',
      languages: ['ru', 'en'],
      cities: ['Вриндаван'],
      telegram: '@guide_1',
      phone: '+7 900',
    });
  });

  it('пустое тело даёт пустой профиль', () => {
    expect(parseGuideInput({})).toEqual({
      about: '',
      languages: [],
      cities: [],
      telegram: null,
      phone: null,
    });
  });

  it.each([
    [{ about: 'x'.repeat(2001) }],
    [{ languages: [''] }],
    [{ languages: ['x'.repeat(41)] }],
    [{ languages: Array.from({ length: 11 }, (_, i) => `l${i}`) }],
    [{ cities: 'Москва' }],
    [{ cities: [1] }],
    [{ phone: 'x'.repeat(31) }],
    [{ telegram: 'a' }],
  ])('отказывает на %j', (body) => {
    expect(() => parseGuideInput(body)).toThrow(BadRequestException);
  });

  it('не объект — 400', () => {
    expect(() => parseGuideInput(null)).toThrow(BadRequestException);
  });
});
