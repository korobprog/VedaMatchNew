import { BadRequestException } from '@nestjs/common';
import { STATUS_LINE_MAX_LENGTH } from '@vedamatch/shared';
import { normalizeStatusLine } from './status-line';

describe('normalizeStatusLine', () => {
  it('обрезает края', () => {
    expect(normalizeStatusLine('  В Маяпуре до марта  ')).toBe(
      'В Маяпуре до марта',
    );
  });

  it('схлопывает переносы: статус стоит в одну строку рядом с именем', () => {
    expect(normalizeStatusLine('В Маяпуре\n\n   до марта')).toBe(
      'В Маяпуре до марта',
    );
  });

  it('пусто — значит убрать', () => {
    expect(normalizeStatusLine('')).toBeNull();
    expect(normalizeStatusLine('   ')).toBeNull();
    expect(normalizeStatusLine(null)).toBeNull();
    expect(normalizeStatusLine(undefined)).toBeNull();
  });

  it('длину считает после схлопывания, а не по исходной строке', () => {
    // Иначе строка из пробелов между двумя словами отбивалась бы как длинная.
    const spaced = `А${' '.repeat(STATUS_LINE_MAX_LENGTH)}Б`;

    expect(normalizeStatusLine(spaced)).toBe('А Б');
  });

  it('слишком длинный отбивает', () => {
    expect(() =>
      normalizeStatusLine('я'.repeat(STATUS_LINE_MAX_LENGTH + 1)),
    ).toThrow(BadRequestException);
  });

  it('ровно по пределу проходит', () => {
    const exact = 'я'.repeat(STATUS_LINE_MAX_LENGTH);

    expect(normalizeStatusLine(exact)).toBe(exact);
  });
});
