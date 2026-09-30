import { BadRequestException } from '@nestjs/common';
import {
  parseAdminPlacesQuery,
  parseAdminReportsQuery,
  parsePlacesQuery,
} from './map-query';

describe('parsePlacesQuery', () => {
  it('пустой запрос: без рамки, общины включены', () => {
    expect(parsePlacesQuery({})).toEqual({
      bbox: null,
      kinds: [],
      q: null,
      lineage: null,
      communities: true,
      stays: true,
    });
  });

  it('stays=0 выключает слой ночлега, по умолчанию он включён', () => {
    expect(parsePlacesQuery({}).stays).toBe(true);
    expect(parsePlacesQuery({ stays: '1' }).stays).toBe(true);
    expect(parsePlacesQuery({ stays: '0' }).stays).toBe(false);
  });

  it('рамка — все четыре границы или ни одной', () => {
    expect(
      parsePlacesQuery({ minLat: '1', maxLat: '2', minLng: '3', maxLng: '4' })
        .bbox,
    ).toEqual({ minLat: 1, maxLat: 2, minLng: 3, maxLng: 4 });
    expect(() => parsePlacesQuery({ minLat: '1', maxLat: '2' })).toThrow(
      BadRequestException,
    );
    expect(() =>
      parsePlacesQuery({ minLat: 'x', maxLat: '2', minLng: '3', maxLng: '4' }),
    ).toThrow(BadRequestException);
  });

  it('виды: неизвестные отбрасываются, дубли схлопываются', () => {
    expect(
      parsePlacesQuery({ kinds: 'temple, cafe,bar,temple' }).kinds,
    ).toEqual(['temple', 'cafe']);
  });

  it('q обрезается до 100, линия проверяется, communities=0 выключает слой', () => {
    const q = parsePlacesQuery({
      q: `  ${'а'.repeat(150)} `,
      lineage: 'iskcon',
      communities: '0',
    });
    expect(q.q).toHaveLength(100);
    expect(q.lineage).toBe('iskcon');
    expect(q.communities).toBe(false);
    expect(parsePlacesQuery({ lineage: 'zzz' }).lineage).toBeNull();
  });
});

describe('админские запросы', () => {
  it('места: статус, проверенность, поиск', () => {
    expect(
      parseAdminPlacesQuery({ status: 'hidden', verified: '0', q: ' х ' }),
    ).toEqual({ status: 'hidden', verified: false, q: 'х' });
    expect(parseAdminPlacesQuery({ status: 'zzz' })).toEqual({
      status: null,
      verified: null,
      q: null,
    });
  });

  it('жалобы: по умолчанию открытые, all — все', () => {
    expect(parseAdminReportsQuery({})).toEqual({ status: 'open' });
    expect(parseAdminReportsQuery({ status: 'resolved' })).toEqual({
      status: 'resolved',
    });
    expect(parseAdminReportsQuery({ status: 'all' })).toEqual({ status: null });
  });
});
