import { BadRequestException } from '@nestjs/common';
import { parseCreateRouteInput, parseUpdateRouteInput } from './route-input';

const stop = (over: Record<string, unknown> = {}) => ({
  name: 'Старт',
  lat: 27.5,
  lng: 77.6,
  ...over,
});
const valid = (over: Record<string, unknown> = {}) => ({
  kind: 'parikrama',
  name: 'Вриндаван',
  stops: [stop(), stop({ name: 'Финиш', lat: 27.6 })],
  ...over,
});

describe('route-input', () => {
  it('разбирает верный маршрут и подставляет умолчания', () => {
    const r = parseCreateRouteInput(valid({ city: '  ' }));
    expect(r.description).toBe('');
    expect(r.city).toBeNull();
    expect(r.stops[0]).toEqual({
      id: null,
      placeId: null,
      name: 'Старт',
      lat: 27.5,
      lng: 77.6,
      note: '',
    });
  });

  it.each([
    ['вид', valid({ kind: 'x' })],
    ['короткое имя', valid({ name: 'a' })],
    ['длинное описание', valid({ description: 'a'.repeat(4001) })],
    ['одна остановка', valid({ stops: [stop()] })],
    [
      '61 остановка',
      valid({ stops: Array.from({ length: 61 }, () => stop()) }),
    ],
    ['широта', valid({ stops: [stop({ lat: 91 }), stop()] })],
    ['NaN', valid({ stops: [stop({ lng: NaN }), stop()] })],
    ['строка вместо числа', valid({ stops: [stop({ lat: '1' }), stop()] })],
    ['пустое имя остановки', valid({ stops: [stop({ name: ' ' }), stop()] })],
    [
      'длинная заметка',
      valid({ stops: [stop({ note: 'a'.repeat(501) }), stop()] }),
    ],
    ['id числом', valid({ stops: [stop({ id: 5 }), stop()] })],
    ['placeId числом', valid({ stops: [stop({ placeId: 5 }), stop()] })],
  ])('отклоняет: %s', (_label, body) => {
    expect(() => parseCreateRouteInput(body)).toThrow(BadRequestException);
  });

  it('PATCH берёт только пришедшие поля', () => {
    expect(parseUpdateRouteInput({ name: 'Новое' })).toEqual({ name: 'Новое' });
    expect(parseUpdateRouteInput({ city: null })).toEqual({ city: null });
  });

  it('PATCH без полей — ошибка', () => {
    expect(() => parseUpdateRouteInput({})).toThrow(BadRequestException);
  });
});
