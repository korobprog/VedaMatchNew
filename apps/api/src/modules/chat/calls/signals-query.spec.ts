import { BadRequestException } from '@nestjs/common';
import { parseSignalsAfter } from './signals-query';

describe('parseSignalsAfter', () => {
  it('без параметра — с начала (0)', () => {
    expect(parseSignalsAfter(undefined)).toBe(0);
  });

  it('строку-число разбирает в число', () => {
    expect(parseSignalsAfter('7')).toBe(7);
  });

  it('0 — валидное значение (полная история)', () => {
    expect(parseSignalsAfter('0')).toBe(0);
  });

  it('нечисловая строка — 400', () => {
    expect(() => parseSignalsAfter('nope')).toThrow(BadRequestException);
  });

  it('отрицательное число — 400', () => {
    expect(() => parseSignalsAfter('-1')).toThrow(BadRequestException);
  });

  it('пустая строка (`?after=`) — тоже «с начала»', () => {
    expect(parseSignalsAfter('')).toBe(0);
  });
});
