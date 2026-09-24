import type { MediaTrack } from './media-parse';
import {
  INITIAL_PLAYER_STATE,
  currentTrack,
  hasNext,
  hasPrevious,
  isActive,
  playerReducer,
  type NativeSnapshot,
  type PlayerEvent,
  type PlayerState,
} from './player-state';

function track(id: string, durationSeconds = 300): MediaTrack {
  return { id, title: `Запись ${id}`, artist: 'Исполнитель', album: null, coverUrl: null, durationSeconds };
}

function snap(over: Partial<NativeSnapshot> = {}): NativeSnapshot {
  return {
    isLoaded: true,
    playing: false,
    isBuffering: false,
    currentTime: 0,
    duration: 300,
    didJustFinish: false,
    error: null,
    ...over,
  };
}

function run(events: PlayerEvent[], from: PlayerState = INITIAL_PLAYER_STATE): PlayerState {
  return events.reduce(playerReducer, from);
}

const loaded = run([{ type: 'load', queue: [track('a')], index: 0 }]);
const playing = run([{ type: 'native', snapshot: snap({ playing: true, currentTime: 12 }) }], loaded);

describe('playerReducer — загрузка', () => {
  it('выбор записи: загрузка, длительность из каталога, позиция с нуля', () => {
    expect(loaded.status).toBe('loading');
    expect(loaded.durationSec).toBe(300);
    expect(loaded.positionSec).toBe(0);
    expect(currentTrack(loaded)?.id).toBe('a');
  });

  it('пустая очередь ничего не меняет', () => {
    expect(playerReducer(INITIAL_PLAYER_STATE, { type: 'load', queue: [], index: 0 })).toBe(INITIAL_PLAYER_STATE);
  });

  it('индекс за пределами очереди прижимается к краю', () => {
    const state = run([{ type: 'load', queue: [track('a'), track('b')], index: 9 }]);
    expect(currentTrack(state)?.id).toBe('b');
  });

  it('пустой снимок до открытия потока не превращает загрузку в паузу', () => {
    const state = run([{ type: 'native', snapshot: snap({ isLoaded: false }) }], loaded);
    expect(state.status).toBe('loading');
  });

  it('поток открыт, звук ещё не пошёл — всё ещё загрузка, а не пауза', () => {
    expect(run([{ type: 'native', snapshot: snap() }], loaded).status).toBe('loading');
  });

  it('без выбранной записи снимки натива игнорируются', () => {
    expect(playerReducer(INITIAL_PLAYER_STATE, { type: 'native', snapshot: snap({ playing: true }) })).toBe(
      INITIAL_PLAYER_STATE,
    );
  });
});

describe('playerReducer — играет, пауза, буферизация, ошибка', () => {
  it('натив играет — «играет», позиция и длительность из снимка', () => {
    expect(playing.status).toBe('playing');
    expect(playing.positionSec).toBe(12);
    expect(isActive(playing)).toBe(true);
  });

  it('ждёт сеть во время игры — «буферизация»', () => {
    const state = run([{ type: 'native', snapshot: snap({ playing: true, isBuffering: true, currentTime: 20 }) }], playing);
    expect(state.status).toBe('buffering');
    expect(isActive(state)).toBe(true);
  });

  it('натив встал сам (экран блокировки, наушники) — «пауза»', () => {
    const state = run([{ type: 'native', snapshot: snap({ currentTime: 40 }) }], playing);
    expect(state.status).toBe('paused');
    expect(state.positionSec).toBe(40);
    expect(isActive(state)).toBe(false);
  });

  it('пауза человека', () => {
    expect(run([{ type: 'pause' }], playing).status).toBe('paused');
  });

  it('«играть» с паузы — ждём звук, пока натив не подтвердит', () => {
    const paused = run([{ type: 'pause' }], playing);
    expect(run([{ type: 'play' }], paused).status).toBe('buffering');
  });

  it('ошибка натива — «ошибка» с текстом', () => {
    const state = run([{ type: 'native', snapshot: snap({ error: 'поток оборвался' }) }], playing);
    expect(state.status).toBe('error');
    expect(state.error).toBe('поток оборвался');
  });

  it('после ошибки «играть» начинает ту же запись заново', () => {
    const failed = run([{ type: 'fail', message: 'нет сети' }], playing);
    const retried = run([{ type: 'play' }], failed);
    expect(retried.status).toBe('loading');
    expect(retried.error).toBeNull();
    expect(currentTrack(retried)?.id).toBe('a');
  });

  it('дослушали — «конец», «играть» начинает с начала', () => {
    const ended = run([{ type: 'native', snapshot: snap({ didJustFinish: true, currentTime: 300 }) }], playing);
    expect(ended.status).toBe('ended');
    const again = run([{ type: 'play' }], ended);
    expect(again.status).toBe('loading');
    expect(again.positionSec).toBe(0);
  });

  it('пауза и ошибка не выживают с «конца» и «ошибки»', () => {
    const failed = run([{ type: 'fail', message: 'x' }], playing);
    expect(run([{ type: 'pause' }], failed)).toBe(failed);
  });

  it('длительность из натива важнее каталожной оценки', () => {
    const state = run([{ type: 'native', snapshot: snap({ playing: true, duration: 312 }) }], loaded);
    expect(state.durationSec).toBe(312);
  });

  it('позиция не уходит за длительность и не бывает NaN', () => {
    const state = run([{ type: 'native', snapshot: snap({ playing: true, currentTime: Number.NaN }) }], loaded);
    expect(state.positionSec).toBe(0);
    const over = run([{ type: 'native', snapshot: snap({ playing: true, currentTime: 999 }) }], loaded);
    expect(over.positionSec).toBe(300);
  });
});

describe('playerReducer — перемотка', () => {
  it('в пределах записи', () => {
    expect(run([{ type: 'seek', positionSec: -5 }], playing).positionSec).toBe(0);
    expect(run([{ type: 'seek', positionSec: 1000 }], playing).positionSec).toBe(300);
    expect(run([{ type: 'seek', positionSec: 90 }], playing).positionSec).toBe(90);
  });

  it('перемотка дослушанной — пауза на новой секунде, а не «конец»', () => {
    const ended = run([{ type: 'native', snapshot: snap({ didJustFinish: true }) }], playing);
    expect(run([{ type: 'seek', positionSec: 30 }], ended).status).toBe('paused');
  });
});

describe('playerReducer — звонок и чужой звук', () => {
  it('звонок прерывает и обещает вернуть звук', () => {
    const state = run([{ type: 'interrupt', reason: 'call' }], playing);
    expect(state.status).toBe('paused');
    expect(state.resumeAfterCall).toBe(true);
    expect(run([{ type: 'call-ended' }], state).status).toBe('buffering');
    expect(run([{ type: 'call-ended' }], state).resumeAfterCall).toBe(false);
  });

  it('рингтон — тоже звонок', () => {
    expect(run([{ type: 'interrupt', reason: 'ringtone' }], playing).resumeAfterCall).toBe(true);
  });

  it('голосовое и запись прерывают без возврата', () => {
    for (const reason of ['voice', 'recording'] as const) {
      const state = run([{ type: 'interrupt', reason }], playing);
      expect(state.status).toBe('paused');
      expect(state.resumeAfterCall).toBe(false);
      expect(run([{ type: 'call-ended' }], state)).toBe(state);
    }
  });

  it('стоявшее на паузе звонок не «вернёт»', () => {
    const paused = run([{ type: 'pause' }], playing);
    const state = run([{ type: 'interrupt', reason: 'call' }], paused);
    expect(state).toBe(paused);
    expect(run([{ type: 'call-ended' }], state)).toBe(paused);
  });

  it('пауза человека во время звонка отменяет возврат', () => {
    const state = run([{ type: 'interrupt', reason: 'call' }, { type: 'pause' }], playing);
    expect(state.resumeAfterCall).toBe(false);
  });

  it('система вернула звук сама (фокус) — возвращать уже нечего', () => {
    const state = run(
      [{ type: 'interrupt', reason: 'call' }, { type: 'native', snapshot: snap({ playing: true, currentTime: 13 }) }],
      playing,
    );
    expect(state.status).toBe('playing');
    expect(state.resumeAfterCall).toBe(false);
  });

  it('пока натив молчит после нашей паузы, обещание вернуть звук держится', () => {
    const state = run(
      [{ type: 'interrupt', reason: 'call' }, { type: 'native', snapshot: snap({ currentTime: 12 }) }],
      playing,
    );
    expect(state.resumeAfterCall).toBe(true);
  });
});

describe('очередь — уже очередь, даже из одной записи', () => {
  const queue = run([{ type: 'load', queue: [track('a'), track('b'), track('c')], index: 1 }]);

  it('соседи есть в середине и нет по краям', () => {
    expect(hasNext(queue)).toBe(true);
    expect(hasPrevious(queue)).toBe(true);
    expect(hasNext(loaded)).toBe(false);
    expect(hasPrevious(loaded)).toBe(false);
  });

  it('вперёд и назад переключают запись', () => {
    expect(currentTrack(run([{ type: 'next' }], queue))?.id).toBe('c');
    expect(currentTrack(run([{ type: 'previous' }], queue))?.id).toBe('a');
  });

  it('на последней «вперёд» ничего не делает', () => {
    const last = run([{ type: 'next' }], queue);
    expect(run([{ type: 'next' }], last)).toBe(last);
  });

  it('«назад» дальше трёх секунд — к началу той же записи', () => {
    const deep = run([{ type: 'native', snapshot: snap({ playing: true, currentTime: 50 }) }], queue);
    const state = run([{ type: 'previous' }], deep);
    expect(currentTrack(state)?.id).toBe('b');
    expect(state.positionSec).toBe(0);
  });

  it('«стоп» закрывает плеер целиком', () => {
    expect(run([{ type: 'stop' }], playing)).toEqual(INITIAL_PLAYER_STATE);
  });
});
