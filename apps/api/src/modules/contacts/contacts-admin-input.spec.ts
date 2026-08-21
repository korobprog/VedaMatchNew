import { BadRequestException } from '@nestjs/common';
import {
  assertTagSlug,
  buildProfileWhere,
  normalizeTagInput,
} from './contacts-admin-input';

describe('assertTagSlug', () => {
  it('принимает слаг из строчных букв, цифр и дефисов', () => {
    expect(assertTagSlug('prasad-cooking')).toBe('prasad-cooking');
  });

  it('приводит к нижнему регистру и обрезает пробелы', () => {
    expect(assertTagSlug('  Kirtan  ')).toBe('kirtan');
  });

  it('отклоняет то, что нельзя поставить в фильтр', () => {
    for (const bad of ['', '-kirtan', 'kirtan-', 'ки ртан', 'киртан']) {
      expect(() => assertTagSlug(bad)).toThrow(BadRequestException);
    }
  });
});

describe('normalizeTagInput', () => {
  it('пустое тело не меняет ничего', () => {
    expect(normalizeTagInput({})).toEqual({});
  });

  it('правка порядка не затирает название', () => {
    expect(normalizeTagInput({ sortOrder: 5 })).toEqual({ sortOrder: 5 });
  });

  it('обрезает пробелы у названия', () => {
    expect(normalizeTagInput({ nameRu: '  Киртан  ' })).toEqual({
      nameRu: 'Киртан',
    });
  });

  it('пустое название не пропускает', () => {
    expect(() => normalizeTagInput({ nameRu: '   ' })).toThrow(
      BadRequestException,
    );
  });

  it('проверяет вид тега по списку', () => {
    expect(normalizeTagInput({ kind: 'service' })).toEqual({ kind: 'service' });
    expect(() => normalizeTagInput({ kind: 'hobby' as never })).toThrow(
      BadRequestException,
    );
  });

  it('порядок — целое число', () => {
    expect(() => normalizeTagInput({ sortOrder: 2.5 })).toThrow(
      BadRequestException,
    );
    expect(() => normalizeTagInput({ sortOrder: 'первый' as never })).toThrow(
      BadRequestException,
    );
  });
});

describe('buildProfileWhere', () => {
  it('пустой запрос не фильтрует', () => {
    expect(buildProfileWhere({})).toEqual({});
  });

  it('фильтрует по статусу карточки', () => {
    expect(buildProfileWhere({ status: 'pending' })).toEqual({
      status: 'pending',
    });
  });

  it('«только скрытые» смотрит на выбор человека, а не на статус', () => {
    expect(buildProfileWhere({ hiddenOnly: true })).toEqual({
      visibility: 'hidden',
    });
  });

  it('ищет по заголовку карточки, имени и почте', () => {
    expect(buildProfileWhere({ q: ' Деваки ' })).toEqual({
      OR: [
        { headline: { contains: 'Деваки', mode: 'insensitive' } },
        { user: { name: { contains: 'Деваки', mode: 'insensitive' } } },
        { user: { email: { contains: 'Деваки', mode: 'insensitive' } } },
      ],
    });
  });

  it('пустой поиск не превращается в фильтр по пустой строке', () => {
    expect(buildProfileWhere({ q: '   ' })).toEqual({});
  });
});
