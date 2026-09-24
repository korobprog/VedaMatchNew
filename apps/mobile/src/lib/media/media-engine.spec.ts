import { announceAudioStart, onYield, resetAudioArbiterForTests } from '@/lib/audio/audio-arbiter';
import { ApiError } from '@/lib/api/client';
import { createMediaEngine, type MediaEngineDeps, type NativeMediaPlayer } from './media-engine';
import type { MediaTrack } from './media-parse';
import type { NativeSnapshot } from './player-state';

/**
 * Движок плеера на поддельном нативном плеере: последовательности, которые
 * на телефоне проверяются руками, здесь — шагами.
 */

function track(id: string): MediaTrack {
  return { id, title: `Лекция ${id}`, artist: 'Лектор', album: 'Курс', coverUrl: 'https://cdn.example.com/c.jpg', durationSeconds: 600 };
}

class FakePlayer implements NativeMediaPlayer {
  calls: string[] = [];
  listener: ((status: NativeSnapshot) => void) | null = null;
  lockScreen: { active: boolean; metadata?: unknown } | null = null;
  replace(source: { uri: string }) {
    this.calls.push(`replace ${source.uri}`);
  }
  play() {
    this.calls.push('play');
  }
  pause() {
    this.calls.push('pause');
  }
  seekTo(seconds: number) {
    this.calls.push(`seek ${seconds}`);
  }
  setActiveForLockScreen(active: boolean, metadata?: unknown) {
    this.lockScreen = { active, metadata };
    this.calls.push(`lock ${active}`);
  }
  addListener(_event: 'playbackStatusUpdate', listener: (status: NativeSnapshot) => void) {
    this.listener = listener;
    return { remove: () => (this.listener = null) };
  }
  remove() {
    this.calls.push('remove');
  }
  emit(over: Partial<NativeSnapshot>) {
    this.listener?.({
      isLoaded: true,
      playing: false,
      isBuffering: false,
      currentTime: 0,
      duration: 600,
      didJustFinish: false,
      error: null,
      ...over,
    });
  }
}

function setup() {
  const player = new FakePlayer();
  let now = 1_000_000;
  let urlCounter = 0;
  const api = {
    streamUrl: jest.fn(async (id: string) => ({ url: `https://s3.example.com/${id}.mp3?v=${++urlCounter}`, expiresInSeconds: 6 * 3600 })),
    heartbeat: jest.fn(async () => undefined),
    stopListening: jest.fn(async () => undefined),
  };
  const deps: MediaEngineDeps = {
    createPlayer: jest.fn(() => player),
    api,
    ensureAudioMode: jest.fn(async () => undefined),
    ensureChannel: jest.fn(async () => undefined),
    announce: announceAudioStart,
    onYield,
    now: () => now,
  };
  const engine = createMediaEngine(deps);
  return {
    engine,
    player,
    api,
    deps,
    advance: (ms: number) => {
      now += ms;
    },
  };
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

afterEach(() => resetAudioArbiterForTests());

describe('выбор записи', () => {
  it('ссылка → поток → звук → экран блокировки, режим звука до всего', async () => {
    const { engine, player, api, deps } = setup();
    await engine.playQueue([track('a')]);
    expect(deps.ensureAudioMode).toHaveBeenCalled();
    expect(api.streamUrl).toHaveBeenCalledWith('a');
    expect(player.calls).toEqual(['replace https://s3.example.com/a.mp3?v=1', 'play', 'lock true']);
    expect(player.lockScreen?.metadata).toEqual({
      title: 'Лекция a',
      artist: 'Лектор',
      albumTitle: 'Курс',
      artworkUrl: 'https://cdn.example.com/c.jpg',
    });
    expect(engine.getState().status).toBe('loading');
    player.emit({ playing: true, currentTime: 1 });
    expect(engine.getState().status).toBe('playing');
  });

  it('один нативный плеер на все записи', async () => {
    const { engine, deps } = setup();
    await engine.playQueue([track('a')]);
    await engine.playQueue([track('b')]);
    expect(deps.createPlayer).toHaveBeenCalledTimes(1);
  });

  it('повторное нажатие на играющую запись — пауза, а не «с начала»', async () => {
    const { engine, player } = setup();
    await engine.playQueue([track('a')]);
    player.emit({ playing: true, currentTime: 30 });
    await engine.playQueue([track('a')]);
    expect(engine.getState().status).toBe('paused');
    expect(player.calls.filter((call) => call.startsWith('replace'))).toHaveLength(1);
  });

  it('сервер не дал ссылку — ошибка словами, звук не трогаем', async () => {
    const { engine, player, api } = setup();
    api.streamUrl.mockRejectedValueOnce(new ApiError(404, 'Запись не найдена', null));
    await engine.playQueue([track('a')]);
    expect(engine.getState().status).toBe('error');
    expect(engine.getState().error).toBe('Запись недоступна — возможно, её сняли с публикации.');
    expect(player.calls).toEqual([]);
  });

  it('ответ на прошлый выбор не перебивает новый', async () => {
    const { engine, player, api } = setup();
    let release: () => void = () => undefined;
    api.streamUrl.mockImplementationOnce(
      (id: string) =>
        new Promise((resolve) => {
          release = () => resolve({ url: `https://s3.example.com/${id}-slow.mp3`, expiresInSeconds: 21600 });
        }),
    );
    const first = engine.playQueue([track('a')]);
    await engine.playQueue([track('b')]);
    release();
    await first;
    expect(player.calls.filter((call) => call.startsWith('replace'))).toEqual(['replace https://s3.example.com/b.mp3?v=1']);
  });
});

describe('пауза, продолжение, перемотка', () => {
  it('пауза и продолжение без новой ссылки', async () => {
    const { engine, player, api } = setup();
    await engine.playQueue([track('a')]);
    player.emit({ playing: true, currentTime: 5 });
    engine.pause();
    expect(player.calls.at(-1)).toBe('pause');
    await engine.play();
    expect(player.calls.at(-1)).toBe('play');
    expect(api.streamUrl).toHaveBeenCalledTimes(1);
  });

  it('после паузы дольше жизни ссылки — новая ссылка и та же секунда', async () => {
    const { engine, player, api, advance } = setup();
    await engine.playQueue([track('a')]);
    player.emit({ playing: true, currentTime: 125 });
    engine.pause();
    player.emit({ playing: false, currentTime: 125 });
    advance(7 * 3600 * 1000);
    await engine.play();
    expect(api.streamUrl).toHaveBeenCalledTimes(2);
    expect(player.calls.slice(-4)).toEqual(['replace https://s3.example.com/a.mp3?v=2', 'seek 125', 'play', 'lock true']);
  });

  it('ошибка потока: одна попытка со свежей ссылкой, вторая — ошибка на экран', async () => {
    const { engine, player, api } = setup();
    await engine.playQueue([track('a')]);
    player.emit({ playing: true, currentTime: 40 });
    player.emit({ playing: false, currentTime: 40, error: 'Source error' });
    await flush();
    expect(api.streamUrl).toHaveBeenCalledTimes(2);
    expect(engine.getState().status).not.toBe('error');
    player.emit({ playing: false, currentTime: 40, error: 'Source error' });
    expect(engine.getState().status).toBe('error');
    expect(api.streamUrl).toHaveBeenCalledTimes(2);
  });

  it('±10 секунд в пределах записи', async () => {
    const { engine, player } = setup();
    await engine.playQueue([track('a')]);
    player.emit({ playing: true, currentTime: 4 });
    engine.skip(-10);
    expect(player.calls.at(-1)).toBe('seek 0');
    engine.skip(10);
    expect(player.calls.at(-1)).toBe('seek 10');
  });

  it('«закрыть» снимает звук, шторку и «слушает сейчас»', async () => {
    const { engine, player, api } = setup();
    await engine.playQueue([track('a')]);
    engine.stop();
    expect(player.calls.slice(-2)).toEqual(['pause', 'lock false']);
    expect(api.stopListening).toHaveBeenCalled();
    expect(engine.getState().status).toBe('idle');
  });
});

describe('звонок', () => {
  it('звонок начался — пауза; кончился — звук вернулся', async () => {
    const { engine, player } = setup();
    await engine.playQueue([track('a')]);
    player.emit({ playing: true, currentTime: 60 });
    engine.setCallBusy(true);
    expect(player.calls.at(-1)).toBe('pause');
    expect(engine.getState().status).toBe('paused');
    player.emit({ playing: false, currentTime: 60 });
    engine.setCallBusy(false);
    await flush();
    expect(player.calls.at(-1)).toBe('play');
  });

  it('стоявшее на паузе после звонка молчит', async () => {
    const { engine, player } = setup();
    await engine.playQueue([track('a')]);
    player.emit({ playing: true, currentTime: 60 });
    engine.pause();
    const before = player.calls.length;
    engine.setCallBusy(true);
    engine.setCallBusy(false);
    expect(player.calls.length).toBe(before);
  });

  it('во время звонка «играть» не включает звук', async () => {
    const { engine, player } = setup();
    await engine.playQueue([track('a')]);
    player.emit({ playing: true, currentTime: 60 });
    engine.setCallBusy(true);
    const before = player.calls.length;
    await engine.play();
    expect(player.calls.length).toBe(before);
    expect(engine.isCallBusy()).toBe(true);
  });

  it('рингтон по арбитру — пауза с возвратом после звонка', async () => {
    const { engine, player } = setup();
    await engine.playQueue([track('a')]);
    player.emit({ playing: true, currentTime: 60 });
    announceAudioStart('ringtone');
    expect(engine.getState().resumeAfterCall).toBe(true);
    engine.setCallBusy(true);
    engine.setCallBusy(false);
    await flush();
    expect(player.calls.at(-1)).toBe('play');
  });
});

describe('договорённость с голосовыми', () => {
  it('включили голосовое — Медиатека на паузе и сама не возвращается', async () => {
    const { engine, player } = setup();
    await engine.playQueue([track('a')]);
    player.emit({ playing: true, currentTime: 60 });
    announceAudioStart('voice');
    expect(player.calls.at(-1)).toBe('pause');
    expect(engine.getState().resumeAfterCall).toBe(false);
  });

  it('Медиатека, начав играть, просит голосовое замолчать', async () => {
    const { engine } = setup();
    const voice = jest.fn();
    onYield('voice', voice);
    await engine.playQueue([track('a')]);
    expect(voice).toHaveBeenCalledWith('media');
  });
});

describe('отключение наушников и экран блокировки', () => {
  it('натив встал сам — плеер показывает паузу и не включает звук обратно', async () => {
    const { engine, player } = setup();
    await engine.playQueue([track('a')]);
    player.emit({ playing: true, currentTime: 60 });
    const before = player.calls.length;
    // Так выглядит отключение наушников: ExoPlayer ставит паузу сам
    // (`setHandleAudioBecomingNoisy`, заплатка expo-audio).
    player.emit({ playing: false, currentTime: 60 });
    expect(engine.getState().status).toBe('paused');
    expect(player.calls.length).toBe(before);
  });

  it('запустили с экрана блокировки — плеер показывает «играет»', async () => {
    const { engine, player } = setup();
    await engine.playQueue([track('a')]);
    player.emit({ playing: false, currentTime: 60 });
    engine.pause();
    player.emit({ playing: true, currentTime: 61 });
    expect(engine.getState().status).toBe('playing');
  });
});

describe('история прослушиваний', () => {
  it('раз в полминуты и на паузе — прослушанные секунды, на паузе — «перестал слушать»', async () => {
    const { engine, player, api, advance } = setup();
    await engine.playQueue([track('a')]);
    for (let second = 1; second <= 31; second += 1) {
      advance(1000);
      player.emit({ playing: true, currentTime: second });
    }
    expect(api.heartbeat).toHaveBeenCalledTimes(1);
    expect(api.heartbeat).toHaveBeenLastCalledWith({ trackId: 'a', positionSeconds: 30, listenedSeconds: 29 });
    player.emit({ playing: false, currentTime: 31 });
    expect(api.heartbeat).toHaveBeenCalledTimes(2);
    expect(api.stopListening).toHaveBeenCalledTimes(1);
  });

  it('перемотка вперёд прослушиванием не считается', async () => {
    const { engine, player, api, advance } = setup();
    await engine.playQueue([track('a')]);
    player.emit({ playing: true, currentTime: 1 });
    engine.seekTo(500);
    advance(31_000);
    player.emit({ playing: true, currentTime: 501 });
    expect(api.heartbeat).toHaveBeenLastCalledWith(expect.objectContaining({ listenedSeconds: 1 }));
  });
});
