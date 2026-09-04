import {
  INGEST_STALE_MS,
  batchStatusFor,
  isItemStale,
} from './ingest-state';

const at = (minutesAgo: number) =>
  new Date(Date.now() - minutesAgo * 60 * 1000);

describe('batchStatusFor', () => {
  it('пустая партия остаётся черновиком: публиковать нечего', () => {
    expect(batchStatusFor([])).toBe('draft');
  });

  it('пока хоть одна позиция ждёт или качается — партия работает', () => {
    expect(batchStatusFor([{ status: 'stored' }, { status: 'waiting' }])).toBe(
      'running',
    );
    expect(batchStatusFor([{ status: 'fetching' }])).toBe('running');
  });

  it('всё доставлено — партия готова к правке и публикации', () => {
    expect(batchStatusFor([{ status: 'stored' }, { status: 'stored' }])).toBe(
      'ready',
    );
  });

  it('дубли не мешают готовности: пропуск — это нормальный исход', () => {
    expect(batchStatusFor([{ status: 'stored' }, { status: 'skipped' }])).toBe(
      'ready',
    );
  });

  it('часть упала, часть доставлена — партия готова, упавшее повторяют', () => {
    expect(batchStatusFor([{ status: 'stored' }, { status: 'failed' }])).toBe(
      'ready',
    );
  });

  it('упало всё — партия failed: публиковать нечего', () => {
    expect(batchStatusFor([{ status: 'failed' }, { status: 'failed' }])).toBe(
      'failed',
    );
  });

  it('только пропуски — тоже failed: ни одной новой записи не появилось', () => {
    expect(batchStatusFor([{ status: 'skipped' }])).toBe('failed');
  });
});

describe('isItemStale', () => {
  it('качается недолго — не зависла', () => {
    expect(isItemStale({ status: 'fetching', updatedAt: at(5) }, new Date())).toBe(
      false,
    );
  });

  it('качается дольше получаса — зависла, вернуть в очередь', () => {
    expect(isItemStale({ status: 'fetching', updatedAt: at(31) }, new Date())).toBe(
      true,
    );
  });

  it('ждущая позиция не зависает, сколько бы ни ждала', () => {
    // `waiting` не занята процессом: её просто ещё не взяли в работу.
    expect(isItemStale({ status: 'waiting', updatedAt: at(600) }, new Date())).toBe(
      false,
    );
  });

  it('порог ровно на границе считается зависанием', () => {
    const now = new Date();
    const updatedAt = new Date(now.getTime() - INGEST_STALE_MS);
    expect(isItemStale({ status: 'fetching', updatedAt }, now)).toBe(true);
  });
});
