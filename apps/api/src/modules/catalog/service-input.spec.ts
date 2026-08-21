import { BadRequestException } from '@nestjs/common';
import { assertServiceSlug, normalizeServiceInput } from './service-input';

describe('assertServiceSlug', () => {
  it('принимает слаг из строчных букв, цифр и дефисов', () => {
    expect(assertServiceSlug('devotee-space')).toBe('devotee-space');
    expect(assertServiceSlug('astro2')).toBe('astro2');
  });

  it('приводит к нижнему регистру и обрезает пробелы', () => {
    expect(assertServiceSlug('  Union  ')).toBe('union');
  });

  it('отклоняет то, что нельзя поставить в ссылку', () => {
    for (const bad of ['', '-union', 'union-', 'un ion', 'юнион', 'union_1']) {
      expect(() => assertServiceSlug(bad)).toThrow(BadRequestException);
    }
  });
});

describe('normalizeServiceInput', () => {
  it('пустое тело не меняет ничего', () => {
    expect(normalizeServiceInput({})).toEqual({});
  });

  it('отсутствующее поле значит «не менять», а не «стереть»', () => {
    // Правка одного флага не должна обнулять описание соседним полем.
    expect(normalizeServiceInput({ public: false })).toEqual({ public: false });
  });

  it('обрезает пробелы у текстов', () => {
    expect(
      normalizeServiceInput({
        name: '  Знакомства  ',
        category: ' community ',
      }),
    ).toEqual({ name: 'Знакомства', category: 'community' });
  });

  it('не пропускает пустые имя, описание и категорию', () => {
    expect(() => normalizeServiceInput({ name: '   ' })).toThrow(
      BadRequestException,
    );
    expect(() => normalizeServiceInput({ description: '' })).toThrow(
      BadRequestException,
    );
    expect(() => normalizeServiceInput({ category: ' ' })).toThrow(
      BadRequestException,
    );
  });

  it('требует внутренний адрес: карточка портала ведёт в портал', () => {
    expect(normalizeServiceInput({ url: ' /union ' })).toEqual({
      url: '/union',
    });
    expect(() => normalizeServiceInput({ url: 'https://example.com' })).toThrow(
      BadRequestException,
    );
  });

  it('пустая иконка означает «убрать», а не пустую строку', () => {
    expect(normalizeServiceInput({ iconUrl: '  ' })).toEqual({
      iconUrl: null,
    });
    expect(normalizeServiceInput({ iconUrl: null })).toEqual({ iconUrl: null });
  });

  it('проверяет статус по списку', () => {
    expect(normalizeServiceInput({ status: 'coming_soon' })).toEqual({
      status: 'coming_soon',
    });
    expect(() => normalizeServiceInput({ status: 'paused' as never })).toThrow(
      BadRequestException,
    );
  });

  it('порядок — целое число', () => {
    expect(normalizeServiceInput({ sortOrder: 3 })).toEqual({ sortOrder: 3 });
    expect(() => normalizeServiceInput({ sortOrder: 1.5 })).toThrow(
      BadRequestException,
    );
    expect(() =>
      normalizeServiceInput({ sortOrder: 'первый' as never }),
    ).toThrow(BadRequestException);
  });

  it('флаги видимости приводит к булеву значению', () => {
    expect(
      normalizeServiceInput({
        seekerVisible: true,
        yogiVisible: 'да' as never,
      }),
    ).toEqual({ seekerVisible: true, yogiVisible: false });
  });
});
