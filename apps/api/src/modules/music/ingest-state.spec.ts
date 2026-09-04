import {
  INGEST_STALE_MS,
  batchStatusFor,
  inFlightCount,
  ingestInFlightReason,
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

describe('batchStatusFor: published — поглощающее состояние', () => {
  it('доехавший остаток не открывает опубликованную партию заново', () => {
    // Партию из тридцати ссылок публикуют по двенадцати доставленным, а
    // следующий тик доделывает остальные восемнадцать. Верни он партии
    // `ready` — админ нажмёт «Опубликовать всё» второй раз и получит вторую
    // системную подборку с тем же названием.
    expect(
      batchStatusFor(
        [{ status: 'stored' }, { status: 'waiting' }],
        'published',
      ),
    ).toBe('published');
    expect(
      batchStatusFor([{ status: 'stored' }, { status: 'stored' }], 'published'),
    ).toBe('published');
  });

  it('упавшее в опубликованной партии её тоже не расколдовывает', () => {
    expect(batchStatusFor([{ status: 'failed' }], 'published')).toBe(
      'published',
    );
    expect(batchStatusFor([], 'published')).toBe('published');
  });

  it('прочие статусы пересчитываются как раньше', () => {
    expect(batchStatusFor([{ status: 'stored' }], 'running')).toBe('ready');
    expect(batchStatusFor([{ status: 'waiting' }], 'ready')).toBe('running');
  });
});

describe('inFlightCount и текст запрета публикации', () => {
  it('считает только то, что ещё в работе', () => {
    expect(
      inFlightCount([
        { status: 'waiting' },
        { status: 'fetching' },
        { status: 'stored' },
        { status: 'failed' },
        { status: 'skipped' },
      ]),
    ).toBe(2);
    expect(inFlightCount([{ status: 'stored' }])).toBe(0);
  });

  it('склоняет «позицию» по числу: строку читает человек', () => {
    expect(ingestInFlightReason(1)).toBe(
      'Дождитесь окончания приёма: ещё 1 позиция в работе',
    );
    expect(ingestInFlightReason(3)).toBe(
      'Дождитесь окончания приёма: ещё 3 позиции в работе',
    );
    expect(ingestInFlightReason(18)).toBe(
      'Дождитесь окончания приёма: ещё 18 позиций в работе',
    );
    // 11..14 заканчиваются на 1..4, но склоняются как «много».
    expect(ingestInFlightReason(12)).toBe(
      'Дождитесь окончания приёма: ещё 12 позиций в работе',
    );
    expect(ingestInFlightReason(21)).toBe(
      'Дождитесь окончания приёма: ещё 21 позиция в работе',
    );
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
