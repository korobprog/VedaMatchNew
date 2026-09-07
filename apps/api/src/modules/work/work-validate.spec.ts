import { BadRequestException } from '@nestjs/common';
import {
  normalizeWipLimit,
  normalizeWorkColor,
  normalizeWorkPriority,
  optionalText,
  parseWorkDueAt,
  requireSpaceName,
  requireText,
  workPrefixFromName,
  workTaskKey,
} from './work-validate';

describe('workPrefixFromName', () => {
  it('из нескольких слов — инициалы', () => {
    expect(workPrefixFromName('Veda Match')).toBe('VM');
  });

  it('кириллицу транслитерирует', () => {
    expect(workPrefixFromName('Ведический Портал')).toBe('VP');
  });

  it('из одного слова — три буквы', () => {
    expect(workPrefixFromName('Прииск')).toBe('PRI');
  });

  it('длинное название не растягивает префикс', () => {
    expect(
      workPrefixFromName('Один два три четыре пять шесть семь').length,
    ).toBeLessThanOrEqual(5);
  });

  it('знаки препинания не считаются словами', () => {
    expect(workPrefixFromName('Веда — Матч')).toBe('VM');
  });

  it('название без букв даёт запасной префикс', () => {
    expect(workPrefixFromName('!!! ???')).toBe('WRK');
    expect(workPrefixFromName('')).toBe('WRK');
  });

  it('слишком короткое имя не даёт односимвольный префикс', () => {
    expect(workPrefixFromName('О')).toBe('WRK');
  });
});

describe('workTaskKey', () => {
  it('собирает читаемый номер', () => {
    expect(workTaskKey('VM', 14)).toBe('VM-14');
  });
});

describe('requireText', () => {
  it('обрезает пробелы', () => {
    expect(requireText('  дело  ', 'Название', 50)).toBe('дело');
  });

  it('пустое не проходит', () => {
    expect(() => requireText('   ', 'Название', 50)).toThrow(
      BadRequestException,
    );
    expect(() => requireText(undefined, 'Название', 50)).toThrow(
      BadRequestException,
    );
  });

  it('длинное не проходит', () => {
    expect(() => requireText('x'.repeat(51), 'Название', 50)).toThrow(
      BadRequestException,
    );
  });
});

describe('optionalText', () => {
  it('пустая строка допустима — это «стереть»', () => {
    expect(optionalText('', 'Описание', 50)).toBe('');
    expect(optionalText(undefined, 'Описание', 50)).toBe('');
  });

  it('длину всё равно проверяет', () => {
    expect(() => optionalText('x'.repeat(51), 'Описание', 50)).toThrow(
      BadRequestException,
    );
  });
});

describe('normalizeWorkColor', () => {
  it('пропускает известный токен', () => {
    expect(normalizeWorkColor('cyan')).toBe('cyan');
  });

  it('хардкод цвета не проходит: тема бы его пережила, а он её — нет', () => {
    expect(normalizeWorkColor('#ff00aa')).toBe('magenta');
    expect(normalizeWorkColor(undefined)).toBe('magenta');
  });
});

describe('normalizeWorkPriority', () => {
  it('пропускает известную важность', () => {
    expect(normalizeWorkPriority('urgent')).toBe('urgent');
  });

  it('незнакомую сводит к обычной', () => {
    expect(normalizeWorkPriority('blocker')).toBe('normal');
  });
});

describe('parseWorkDueAt', () => {
  it('разбирает ISO-дату', () => {
    expect(parseWorkDueAt('2026-09-10T12:00:00.000Z')?.toISOString()).toBe(
      '2026-09-10T12:00:00.000Z',
    );
  });

  it('пустое значение — «без срока»', () => {
    expect(parseWorkDueAt(null)).toBeNull();
    expect(parseWorkDueAt('')).toBeNull();
    expect(parseWorkDueAt(undefined)).toBeNull();
  });

  it('мусор — ошибка, а не молчаливая потеря срока', () => {
    expect(() => parseWorkDueAt('завтра')).toThrow(BadRequestException);
    expect(() => parseWorkDueAt(42)).toThrow(BadRequestException);
  });
});

describe('requireSpaceName', () => {
  it('имя среды обязательно', () => {
    expect(() => requireSpaceName('')).toThrow(BadRequestException);
    expect(requireSpaceName('Veda Match')).toBe('Veda Match');
  });
});

describe('normalizeWipLimit', () => {
  it('ноль — без предела, и это значение по умолчанию', () => {
    expect(normalizeWipLimit(undefined)).toBe(0);
    expect(normalizeWipLimit(0)).toBe(0);
  });

  it('целое в пределах — проходит', () => {
    expect(normalizeWipLimit(5)).toBe(5);
  });

  it('отрицательное и дробное — ошибка ввода', () => {
    expect(() => normalizeWipLimit(-1)).toThrow(BadRequestException);
    expect(() => normalizeWipLimit(2.5)).toThrow(BadRequestException);
    expect(() => normalizeWipLimit(1000)).toThrow(BadRequestException);
  });
});
