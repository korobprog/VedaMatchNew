import {
  cardSectionId,
  sectionChoiceProblem,
  sectionOnCreate,
  sectionOnMove,
} from './work-task-section';

const work = { id: 'work', name: 'РАБОТА' };
const music = { id: 'music', name: 'МУЗЫКА' };
const pause = { id: 'pause', name: 'ПАУЗА' };
const testing = { id: 'testing', name: 'Тестерование' };
const rework = { id: 'rework', name: 'На доработку' };
const done = { id: 'done', name: 'Выполнено' };

describe('sectionOnCreate', () => {
  it('задача, заведённая в разделе, в нём и числится', () => {
    expect(sectionOnCreate(work)).toBe('work');
  });

  it('незнакомое имя — раздел, а не статус', () => {
    expect(sectionOnCreate(pause)).toBe('pause');
  });

  it('заведённая прямо в статусе — без раздела', () => {
    expect(sectionOnCreate(testing)).toBeNull();
  });
});

describe('sectionOnMove', () => {
  it('раздел → статус: раздел остаётся тем, откуда уехали', () => {
    expect(
      sectionOnMove({ from: work, to: testing, currentSectionId: 'work' }),
    ).toBe('work');
  });

  it('статус → статус: раздел не меняется', () => {
    expect(
      sectionOnMove({ from: testing, to: rework, currentSectionId: 'music' }),
    ).toBe('music');
  });

  it('статус → раздел: раздел — новая колонка', () => {
    expect(
      sectionOnMove({ from: done, to: music, currentSectionId: 'work' }),
    ).toBe('music');
  });

  it('раздел → раздел: раздел — новая колонка', () => {
    expect(
      sectionOnMove({ from: work, to: music, currentSectionId: 'work' }),
    ).toBe('music');
  });

  it('раздел, выбранный в окне вместе со статусом, главнее колонки отъезда', () => {
    expect(
      sectionOnMove({
        from: work,
        to: testing,
        currentSectionId: 'work',
        requestedSectionId: 'music',
      }),
    ).toBe('music');
  });

  it('в колонку раздела выбор в окне не переспорит саму колонку', () => {
    expect(
      sectionOnMove({
        from: testing,
        to: work,
        currentSectionId: 'music',
        requestedSectionId: 'music',
      }),
    ).toBe('work');
  });
});

describe('cardSectionId', () => {
  it('в колонке раздела — сама колонка, даже если запись отстала', () => {
    expect(cardSectionId(work, 'music')).toBe('work');
    expect(cardSectionId(work, null)).toBe('work');
  });

  it('в колонке статуса — запомненный раздел', () => {
    expect(cardSectionId(testing, 'music')).toBe('music');
    expect(cardSectionId(done, null)).toBeNull();
  });
});

describe('sectionChoiceProblem', () => {
  it('раздел выбрать можно', () => {
    expect(sectionChoiceProblem(music)).toBeNull();
  });

  it('колонку статуса разделом не назначить', () => {
    expect(sectionChoiceProblem(done)).toMatch(/статуса/);
  });

  it('чужая или пропавшая колонка', () => {
    expect(sectionChoiceProblem(null)).toBe('Раздел не найден');
  });
});
