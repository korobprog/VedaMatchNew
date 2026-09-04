import { POSITION_STEP } from './playlist-order';
import { INGEST_PLAYLIST_MAX_TITLE, planIngestPlaylist } from './ingest-playlist';

describe('planIngestPlaylist', () => {
  it('пустое название — подборки нет: партию просто опубликовали', () => {
    expect(planIngestPlaylist('', ['t1'])).toBeNull();
    expect(planIngestPlaylist('   ', ['t1'])).toBeNull();
    expect(planIngestPlaylist(undefined, ['t1'])).toBeNull();
  });

  it('без записей подборку не собирает: пустая витрине не нужна', () => {
    expect(planIngestPlaylist('Вечерний киртан', [])).toBeNull();
  });

  it('сохраняет порядок партии и разводит позиции с зазором', () => {
    const plan = planIngestPlaylist(' Вечерний киртан ', ['t1', 't2', 't3']);
    expect(plan).toEqual({
      title: 'Вечерний киртан',
      items: [
        { trackId: 't1', position: POSITION_STEP },
        { trackId: 't2', position: POSITION_STEP * 2 },
        { trackId: 't3', position: POSITION_STEP * 3 },
      ],
    });
  });

  it('обрезает слишком длинное название, а не отказывает', () => {
    const plan = planIngestPlaylist('я'.repeat(300), ['t1']);
    expect(plan?.title).toHaveLength(INGEST_PLAYLIST_MAX_TITLE);
  });

  it('повтор записи выбрасывает: пара плейлист—трек уникальна', () => {
    const plan = planIngestPlaylist('Сборник', ['t1', 't1', 't2']);
    expect(plan?.items).toEqual([
      { trackId: 't1', position: POSITION_STEP },
      { trackId: 't2', position: POSITION_STEP * 2 },
    ]);
  });
});
