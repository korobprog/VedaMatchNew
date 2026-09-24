import type { MediaTrack } from './media-parse';
import { miniPlayerView } from './mini-player-view';
import { INITIAL_PLAYER_STATE, playbackOf, type PlayerState } from './player-state';

const track: MediaTrack = { id: 'a', title: 'Нама-санкиртана', artist: 'Хор храма', album: 'Вечер', coverUrl: null, durationSeconds: 200 };

function state(over: Partial<PlayerState>): PlayerState {
  return { ...INITIAL_PLAYER_STATE, queue: [track], index: 0, status: 'playing', positionSec: 50, durationSec: 200, ...over };
}

describe('miniPlayerView', () => {
  it('ничего не выбрано — мини-плеера нет', () => {
    expect(miniPlayerView(INITIAL_PLAYER_STATE, false)).toBeNull();
  });

  it('играет — «Пауза», исполнитель, доля прослушанного', () => {
    expect(miniPlayerView(state({}), false)).toEqual({
      title: 'Нама-санкиртана',
      subtitle: 'Хор храма',
      primary: 'pause',
      primaryLabel: 'Пауза',
      progress: 0.25,
      waiting: false,
    });
  });

  it('пауза — «Играть»', () => {
    expect(miniPlayerView(state({ status: 'paused' }), false)?.primary).toBe('play');
  });

  it('загрузка и буферизация — крутилка, но кнопка остаётся «Пауза»', () => {
    const loading = miniPlayerView(state({ status: 'loading' }), false);
    expect(loading?.waiting).toBe(true);
    expect(loading?.subtitle).toBe('Загружаем…');
    expect(miniPlayerView(state({ status: 'buffering' }), false)).toMatchObject({ waiting: true, primary: 'pause' });
  });

  it('ошибка — «Повторить» и объяснение', () => {
    expect(miniPlayerView(state({ status: 'error', error: 'x' }), false)).toMatchObject({
      primary: 'retry',
      primaryLabel: 'Повторить',
      subtitle: 'Не удалось воспроизвести',
    });
  });

  it('звонок — объясняет, почему тихо', () => {
    expect(miniPlayerView(state({ status: 'paused', resumeAfterCall: true }), true)?.subtitle).toBe('Пауза на время звонка');
  });

  it('дослушано', () => {
    expect(miniPlayerView(state({ status: 'ended' }), false)?.subtitle).toBe('Дослушано');
  });

  it('без исполнителя — альбом, без альбома — «Медиатека»', () => {
    expect(miniPlayerView(state({ queue: [{ ...track, artist: null }] }), false)?.subtitle).toBe('Вечер');
    expect(miniPlayerView(state({ queue: [{ ...track, artist: null, album: null }] }), false)?.subtitle).toBe('Медиатека');
  });
});

describe('playbackOf', () => {
  it('своя запись — играет или пауза, чужая — никак', () => {
    expect(playbackOf(state({}), 'a')).toBe('playing');
    expect(playbackOf(state({ status: 'paused' }), 'a')).toBe('paused');
    expect(playbackOf(state({}), 'b')).toBe('none');
    expect(playbackOf(INITIAL_PLAYER_STATE, 'a')).toBe('none');
  });
});
