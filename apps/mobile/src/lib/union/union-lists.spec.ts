import type { UnionConnectionRequestDto } from '@vedamatch/shared';
import {
  acceptedConnections,
  connectionLists,
  pendingLikes,
  placeLine,
  shortDate,
  sortIncomingLikes,
  toggleFavorite,
} from './union-lists';
import { unionRequest } from './union-fixtures';

describe('sortIncomingLikes', () => {
  const plain = unionRequest({ id: 'r1', userId: 'u1', createdAt: '2026-09-20T10:00:00Z' });
  const fresh = unionRequest({ id: 'r2', userId: 'u2', createdAt: '2026-09-22T10:00:00Z' });
  const superlike = unionRequest({ id: 'r3', userId: 'u3', createdAt: '2026-09-19T10:00:00Z', isSuperlike: true });

  it('без отметок: суперлайк первым, дальше свежие сверху', () => {
    expect(sortIncomingLikes([plain, fresh, superlike], new Set()).map((r) => r.id)).toEqual(['r3', 'r2', 'r1']);
  });

  it('отмеченный звёздочкой обгоняет даже суперлайк', () => {
    expect(sortIncomingLikes([plain, fresh, superlike], new Set(['u1'])).map((r) => r.id)).toEqual(['r1', 'r3', 'r2']);
  });

  it('не портит входной массив', () => {
    const input = [plain, fresh];
    sortIncomingLikes(input, new Set());
    expect(input.map((r) => r.id)).toEqual(['r1', 'r2']);
  });
});

describe('pendingLikes', () => {
  it('в лайках — только входящие, которые ещё ждут ответа', () => {
    const state = {
      incoming: [
        unionRequest({ id: 'a', status: 'pending' }),
        unionRequest({ id: 'b', status: 'accepted' }),
        unionRequest({ id: 'c', status: 'declined' }),
      ],
      outgoing: [unionRequest({ id: 'd', status: 'pending', direction: 'outgoing' })],
    };
    expect(pendingLikes(state, new Set()).map((r) => r.id)).toEqual(['a']);
  });
});

describe('связи', () => {
  it('принятые — из обоих направлений, без повторов, свежий ответ сверху', () => {
    const shared: UnionConnectionRequestDto = unionRequest({
      id: 'same',
      status: 'accepted',
      respondedAt: '2026-09-10T00:00:00Z',
    });
    const state = {
      incoming: [shared, unionRequest({ id: 'x', status: 'pending' })],
      outgoing: [
        shared,
        unionRequest({ id: 'y', status: 'accepted', direction: 'outgoing', respondedAt: '2026-09-12T00:00:00Z' }),
      ],
    };
    expect(acceptedConnections(state).map((r) => r.id)).toEqual(['y', 'same']);
  });

  it('во входящих ждущие ответа идут первыми, даже если старше', () => {
    const state = {
      incoming: [
        unionRequest({ id: 'old-pending', status: 'pending', createdAt: '2026-09-01T00:00:00Z' }),
        unionRequest({ id: 'new-declined', status: 'declined', createdAt: '2026-09-20T00:00:00Z' }),
      ],
      outgoing: [],
    };
    expect(connectionLists(state).incoming.map((r) => r.id)).toEqual(['old-pending', 'new-declined']);
  });
});

describe('мелкие подписи', () => {
  it('город и страна — через запятую, без обоих — прямо так и сказать', () => {
    expect(placeLine({ city: 'Москва', country: 'Россия' })).toBe('Москва, Россия');
    expect(placeLine({ city: null, country: 'Индия' })).toBe('Индия');
    expect(placeLine({ city: null, country: null })).toBe('Город не указан');
  });

  it('дата — числом, битая — пустой строкой', () => {
    expect(shortDate(new Date(2026, 8, 4, 12).toISOString())).toBe('04.09.2026');
    expect(shortDate('вчера')).toBe('');
  });

  it('звёздочка переключается новым набором, старый не меняется', () => {
    const before = new Set(['u1']);
    const after = toggleFavorite(before, 'u2');
    expect([...after].sort()).toEqual(['u1', 'u2']);
    expect([...toggleFavorite(after, 'u1')]).toEqual(['u2']);
    expect([...before]).toEqual(['u1']);
  });
});
