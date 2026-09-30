import { BadRequestException } from '@nestjs/common';
import { parseCreateTourInput, parseUpdateTourInput } from './tour-input';

const future = () => new Date(Date.now() + 86_400_000).toISOString();
const base = (over: Record<string, unknown> = {}) => ({
  routeId: 'r1',
  startsAt: future(),
  meetingPoint: 'У входа в храм',
  payment: 'free',
  ...over,
});

describe('parseCreateTourInput', () => {
  it('собирает минимальный набор с умолчаниями', () => {
    const out = parseCreateTourInput(base());
    expect(out).toMatchObject({
      routeId: 'r1',
      title: '',
      timezone: null,
      capacity: null,
      priceMinor: null,
      currency: 'rub',
      note: '',
    });
    expect(out.startsAt).toBeInstanceOf(Date);
  });

  it('дата в прошлом — 400', () => {
    expect(() =>
      parseCreateTourInput(
        base({ startsAt: new Date(Date.now() - 1000).toISOString() }),
      ),
    ).toThrow('Дата уже прошла');
  });

  it('цена сохраняется только при paid', () => {
    expect(
      parseCreateTourInput(base({ payment: 'paid', priceMinor: 500 }))
        .priceMinor,
    ).toBe(500);
    expect(
      parseCreateTourInput(base({ payment: 'seva', priceMinor: 500 }))
        .priceMinor,
    ).toBeNull();
  });

  it('принимает известную зону и отвергает выдуманную', () => {
    expect(
      parseCreateTourInput(base({ timezone: 'Asia/Kolkata' })).timezone,
    ).toBe('Asia/Kolkata');
    expect(() => parseCreateTourInput(base({ timezone: 'Mars/Base' }))).toThrow(
      BadRequestException,
    );
  });

  it.each([
    [{ routeId: '' }],
    [{ meetingPoint: 'а' }],
    [{ capacity: 0 }],
    [{ capacity: 501 }],
    [{ capacity: 1.5 }],
    [{ payment: 'gift' }],
    [{ currency: 'btc' }],
    [{ title: 'x'.repeat(121) }],
    [{ note: 'x'.repeat(2001) }],
    [{ payment: 'paid', priceMinor: -1 }],
  ])('отказывает на %j', (over) => {
    expect(() => parseCreateTourInput(base(over))).toThrow(BadRequestException);
  });
});

describe('parseUpdateTourInput', () => {
  it('берёт только присланные поля', () => {
    expect(parseUpdateTourInput({ capacity: 10 })).toEqual({ capacity: 10 });
  });

  it('смена оплаты на не-paid обнуляет цену', () => {
    expect(parseUpdateTourInput({ payment: 'free', priceMinor: 100 })).toEqual({
      payment: 'free',
      priceMinor: null,
    });
  });

  it('дата в прошлом — 400', () => {
    expect(() =>
      parseUpdateTourInput({ startsAt: new Date(0).toISOString() }),
    ).toThrow(BadRequestException);
  });
});
