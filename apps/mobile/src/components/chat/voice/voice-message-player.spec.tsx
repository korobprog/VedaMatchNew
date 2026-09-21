import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import type { ChatAttachmentDto } from '@vedamatch/shared';
import { VoiceMessagePlayer } from './voice-message-player';
import { registerLocalVoiceFile, resetVoiceLocalFileCacheForTests } from '@/lib/chat/voice/voice-local-file-cache';
import { resetVoicePlaybackOrderForTests } from '@/lib/chat/voice/voice-playback-registry';
import { resetVoiceRecordingGuardForTests, setRecordingActive } from '@/lib/chat/voice/voice-recording-guard';
import { PLAYBACK_AUDIO_MODE } from '@/lib/chat/voice/voice-playback-audio-mode';

/**
 * Регресс с живой проверки сборки 5003 (Samsung A51): своё голосовое
 * (0:04, отправлено вчера — локального файла в реестре процесса уже нет)
 * показывало «Не получилось загрузить запись», хотя тот же подписанный
 * адрес открывался в Chrome. `voice-playback-source.spec.ts` уже доказывает,
 * что чистый выбор источника НЕ подрезает подпись S3 — здесь то же самое
 * проверяется на реальном компоненте, вплоть до строки, которая уходит в
 * `player.replace(...)`, чтобы не полагаться только на веру в то, что
 * компонент не портит источник по пути от `attachment.url` до плеера.
 */

const mockPlayer = {
  replace: jest.fn(),
  play: jest.fn(),
  pause: jest.fn(),
  seekTo: jest.fn().mockResolvedValue(undefined),
  setPlaybackRate: jest.fn(),
};

let mockStatus: {
  isLoaded: boolean;
  playing: boolean;
  duration: number;
  currentTime: number;
  didJustFinish: boolean;
  error: string | null;
};

function resetStatus() {
  mockStatus = {
    isLoaded: false,
    playing: false,
    duration: 0,
    currentTime: 0,
    didJustFinish: false,
    error: null,
  };
}

const mockSetAudioModeAsync = jest.fn().mockResolvedValue(undefined);

jest.mock('expo-audio', () => ({
  __esModule: true,
  useAudioPlayer: jest.fn(() => mockPlayer),
  useAudioPlayerStatus: jest.fn(() => mockStatus),
  setAudioModeAsync: (...args: unknown[]) => mockSetAudioModeAsync(...args),
}));

jest.mock('expo-file-system/legacy', () => ({
  __esModule: true,
  getInfoAsync: jest.fn().mockResolvedValue({ exists: false }),
}));

const SIGNED_URL = 'https://s3.example/chat/conv-1/voice.m4a?X-Amz-Signature=abc123&X-Amz-Expires=21600';
const CANONICAL_URL = 'https://s3.example/chat/conv-1/voice.m4a';

function buildAttachment(overrides: Partial<ChatAttachmentDto> = {}): ChatAttachmentDto {
  return {
    id: 'att-1',
    kind: 'voice',
    url: SIGNED_URL,
    durationSec: 4,
    waveform: [1, 2, 3, 4],
    ...overrides,
  };
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

function findPlayButton(renderer: ReactTestRenderer) {
  return renderer.root.findAllByProps({ accessibilityRole: 'button' })[0];
}

/** Текст ошибки под волной — ищем по дереву вывода, не по инстансам React
 *  (композитный `Text` и его хост-узел отдают в `findAllByProps` оба, что
 *  задваивает совпадения по одному и тому же `numberOfLines`). */
function findErrorText(renderer: ReactTestRenderer): string | null {
  const json = renderer.toJSON();
  let found: string | null = null;
  const visit = (node: unknown): void => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    const el = node as { type?: string; props?: Record<string, unknown>; children?: unknown[] };
    if (el.type === 'Text' && el.props?.numberOfLines === 2 && typeof el.children?.[0] === 'string') {
      found = el.children[0] as string;
    }
    if (el.children) el.children.forEach(visit);
  };
  visit(json);
  return found;
}

describe('VoiceMessagePlayer', () => {
  let warnSpy: jest.SpyInstance;
  let renderers: ReactTestRenderer[] = [];

  function renderPlayer(attachment: ChatAttachmentDto): ReactTestRenderer {
    let renderer!: ReactTestRenderer;
    act(() => {
      renderer = create(<VoiceMessagePlayer attachment={attachment} order={1} />);
    });
    renderers.push(renderer);
    return renderer;
  }

  beforeEach(() => {
    jest.useFakeTimers();
    resetStatus();
    resetVoiceLocalFileCacheForTests();
    resetVoicePlaybackOrderForTests();
    resetVoiceRecordingGuardForTests();
    mockPlayer.replace.mockClear();
    mockPlayer.play.mockClear();
    mockPlayer.pause.mockClear();
    mockPlayer.seekTo.mockClear();
    mockPlayer.setPlaybackRate.mockClear();
    mockSetAudioModeAsync.mockClear().mockResolvedValue(undefined);
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    renderers = [];
  });

  afterEach(() => {
    // Размонтируем явно: у плеера есть подписка на `AppState` и таймаут
    // загрузки — без размонтирования они переживают тест и мусорят в
    // следующий (реальные логи «загрузка не уложилась в таймаут» из теста,
    // который его даже не проверял).
    act(() => {
      renderers.forEach((renderer) => renderer.unmount());
    });
    jest.clearAllTimers();
    jest.useRealTimers();
    warnSpy.mockRestore();
  });

  it('без локального файла в плеер уходит ПОЛНАЯ подписанная ссылка, а не обрезанный по query канонический ключ реестра', async () => {
    const renderer = renderPlayer(buildAttachment());
    await act(async () => {
      findPlayButton(renderer).props.onPress();
      await flush();
    });

    expect(mockPlayer.replace).toHaveBeenCalledTimes(1);
    expect(mockPlayer.replace).toHaveBeenCalledWith(SIGNED_URL);
    expect(mockPlayer.replace).not.toHaveBeenCalledWith(CANONICAL_URL);
  });

  it('настоящая ошибка плеера (status.error) показывается сразу, без ожидания таймаута, и уходит в консоль без query с подписью', async () => {
    const renderer = renderPlayer(buildAttachment());
    await act(async () => {
      findPlayButton(renderer).props.onPress();
      await flush();
    });

    act(() => {
      mockStatus = { ...mockStatus, error: 'ExoPlaybackException: Source error' };
      renderer.update(<VoiceMessagePlayer attachment={buildAttachment()} order={1} />);
    });

    expect(findErrorText(renderer)).toBe('Не получилось загрузить запись');

    const loggedUrls = warnSpy.mock.calls.map((call) => JSON.stringify(call)).join('\n');
    expect(loggedUrls).toContain(CANONICAL_URL);
    expect(loggedUrls).not.toContain('X-Amz-Signature');
  });

  it('повтор по кнопке-ошибке перезапускает загрузку одним тапом, без второго нажатия', async () => {
    const renderer = renderPlayer(buildAttachment());
    await act(async () => {
      findPlayButton(renderer).props.onPress();
      await flush();
    });
    act(() => {
      mockStatus = { ...mockStatus, error: 'boom' };
      renderer.update(<VoiceMessagePlayer attachment={buildAttachment()} order={1} />);
    });
    expect(mockPlayer.replace).toHaveBeenCalledTimes(1);

    await act(async () => {
      findPlayButton(renderer).props.onPress();
      await flush();
    });

    // Одного тапа достаточно — вторая загрузка началась сразу, компонент не
    // ждёт отдельного «сначала сбросить, потом снова нажать».
    expect(mockPlayer.replace).toHaveBeenCalledTimes(2);
  });

  it('повторный тап, пока первая загрузка ещё не готова (waiting), не запускает вторую параллельную loadAndPlay', async () => {
    const renderer = renderPlayer(buildAttachment());

    act(() => {
      findPlayButton(renderer).props.onPress();
    });
    act(() => {
      findPlayButton(renderer).props.onPress();
    });
    await flush();

    expect(mockPlayer.replace).toHaveBeenCalledTimes(1);
  });

  it('локальный файл найден — источник плеера файловый путь, не сетевой адрес', async () => {
    registerLocalVoiceFile(SIGNED_URL, 'file:///tmp/voice-local.m4a', 4096, Date.now());
    const fileSystem = jest.requireMock('expo-file-system/legacy') as { getInfoAsync: jest.Mock };
    fileSystem.getInfoAsync.mockResolvedValueOnce({ exists: true });

    const renderer = renderPlayer(buildAttachment());
    await act(async () => {
      findPlayButton(renderer).props.onPress();
      await flush();
    });

    expect(mockPlayer.replace).toHaveBeenCalledWith('file:///tmp/voice-local.m4a');
  });

  /**
   * Живая проверка сборки 5003 (Samsung A51, чат с «Максимом»): своё
   * голосовое 0:04 играло по кругу, перезапускаясь каждые ~5 секунд, — на
   * ОДНОМ голосовом в переписке, без соседей для автоперехода. Причина —
   * не в `voice-playback-order.ts` (единственная запись просто не находит
   * кандидата), а в том, что естественное завершение на Android не
   * останавливает `playWhenReady` у `ExoPlayer`: `player.seekTo(0)` без
   * предварительного `player.pause()` уводит плеер из `ENDED` обратно в
   * `READY`, и он сам возобновляет игру.
   */
  it('естественное завершение ставит плеер на паузу ДО перемотки в начало — без этого ExoPlayer сам возобновляет игру', async () => {
    const renderer = renderPlayer(buildAttachment());
    await act(async () => {
      findPlayButton(renderer).props.onPress();
      await flush();
    });
    expect(mockPlayer.play).toHaveBeenCalledTimes(1);

    const callOrder: string[] = [];
    mockPlayer.pause.mockImplementation(() => callOrder.push('pause'));
    mockPlayer.seekTo.mockImplementation(() => {
      callOrder.push('seekTo');
      return Promise.resolve();
    });

    act(() => {
      mockStatus = { ...mockStatus, isLoaded: true, playing: false, didJustFinish: true };
      renderer.update(<VoiceMessagePlayer attachment={buildAttachment()} order={1} />);
    });

    expect(callOrder).toEqual(['pause', 'seekTo']);
    // Единственная запись в переписке — автопереходу нет кандидата (строго
    // больший `order` среди непрослушанных), `play()` не должен позваться
    // повторно вообще.
    expect(mockPlayer.play).toHaveBeenCalledTimes(1);
  });

  it('второе реальное завершение (новое прослушивание того же клипа) снова ставит на паузу и перематывает, а не копит старое состояние', async () => {
    const renderer = renderPlayer(buildAttachment());
    await act(async () => {
      findPlayButton(renderer).props.onPress();
      await flush();
    });

    act(() => {
      mockStatus = { ...mockStatus, isLoaded: true, playing: false, didJustFinish: true };
      renderer.update(<VoiceMessagePlayer attachment={buildAttachment()} order={1} />);
    });
    // Между двумя завершениями `didJustFinish` обязано пройти через `false`
    // (как и в реальном статусе плеера при повторном ручном воспроизведении) —
    // иначе это не два события, а дребезг одного.
    act(() => {
      mockStatus = { ...mockStatus, didJustFinish: false, playing: true };
      renderer.update(<VoiceMessagePlayer attachment={buildAttachment()} order={1} />);
    });
    act(() => {
      mockStatus = { ...mockStatus, playing: false, didJustFinish: true };
      renderer.update(<VoiceMessagePlayer attachment={buildAttachment()} order={1} />);
    });

    expect(mockPlayer.pause).toHaveBeenCalledTimes(2);
    expect(mockPlayer.seekTo).toHaveBeenCalledTimes(2);
  });

  it('подпись доступности и иконка паузы/игры читаются из одного и того же status.playing — не расходятся между собой', async () => {
    const renderer = renderPlayer(buildAttachment());
    expect(findPlayButton(renderer).props.accessibilityLabel).toBe('Слушать');

    await act(async () => {
      findPlayButton(renderer).props.onPress();
      await flush();
    });
    act(() => {
      mockStatus = { ...mockStatus, isLoaded: true, playing: true };
      renderer.update(<VoiceMessagePlayer attachment={buildAttachment()} order={1} />);
    });
    expect(findPlayButton(renderer).props.accessibilityLabel).toBe('Пауза');

    act(() => {
      mockStatus = { ...mockStatus, playing: false };
      renderer.update(<VoiceMessagePlayer attachment={buildAttachment()} order={1} />);
    });
    expect(findPlayButton(renderer).props.accessibilityLabel).toBe('Слушать');
  });

  /**
   * Защитная мера (`voice-recording-guard.ts`), а не фикс подтверждённого
   * живым наблюдением бага: гипотеза, что активная запись мешает
   * параллельному воспроизведению через занятый микрофон/аудиосессию, на
   * устройстве отдельно не воспроизводилась. Тем не менее, пока запись
   * активна, плеер не должен пытаться поднять источник — тап по волне даёт
   * короткую подсказку, не немой отказ.
   */
  it('пока идёт запись (voice-recording-guard), тап по волне не запускает загрузку — короткая подсказка вместо немого отказа', async () => {
    setRecordingActive(true);
    const renderer = renderPlayer(buildAttachment());

    await act(async () => {
      findPlayButton(renderer).props.onPress();
      await flush();
    });

    expect(mockPlayer.replace).not.toHaveBeenCalled();
    expect(mockPlayer.play).not.toHaveBeenCalled();
    expect(findErrorText(renderer)).toBe('Сначала закончите запись');
  });

  it('когда запись закончилась (voice-recording-guard снят), тот же тап по волне запускает загрузку как обычно', async () => {
    setRecordingActive(true);
    const renderer = renderPlayer(buildAttachment());
    await act(async () => {
      findPlayButton(renderer).props.onPress();
      await flush();
    });
    expect(mockPlayer.replace).not.toHaveBeenCalled();

    setRecordingActive(false);
    await act(async () => {
      findPlayButton(renderer).props.onPress();
      await flush();
    });

    expect(mockPlayer.replace).toHaveBeenCalledTimes(1);
  });

  /**
   * Настоящий дефект, найденный чтением исходников `expo-audio`/
   * `expo-modules-core` (Android): частичный объект в `setAudioModeAsync`
   * (`{ allowsRecording: false }`, как раньше в `voice-recorder-control.tsx:
   * restoreAudioMode()`) откатывает ГЛОБАЛЬНОЕ поле модуля
   * `playsInSilentMode` в JVM-дефолт `false` вместо документированного
   * `true` — на устройстве в тихом/вибро-режиме это делает `player.play()`
   * молчаливой пустышкой (`AudioModule.kt: Function("play")` тихо
   * возвращается на `!shouldPlayInSilentMode()`, без единого лога) для
   * ЛЮБОГО голосового во всём приложении, не только для того, что играло
   * во время записи. Плеер не должен зависеть от того, кто последним менял
   * аудиорежим, — сам приводит его в пригодное для игры состояние перед
   * каждым стартом (`voice-playback-audio-mode.ts`).
   */
  it('перед player.play() плеер сам приводит аудиорежим в пригодный для воспроизведения — не полагаясь на то, что это уже сделал кто-то другой', async () => {
    const renderer = renderPlayer(buildAttachment());
    await act(async () => {
      findPlayButton(renderer).props.onPress();
      await flush();
    });

    expect(mockSetAudioModeAsync).toHaveBeenCalledWith(PLAYBACK_AUDIO_MODE);
    const modeCallOrder = mockSetAudioModeAsync.mock.invocationCallOrder[0];
    const playCallOrder = mockPlayer.play.mock.invocationCallOrder[0];
    expect(modeCallOrder).toBeLessThan(playCallOrder);
  });

  it('повторный старт воспроизведения не зависит от того, вызывал ли кто-то ранее режим записи — режим выставляется заново на каждый play()', async () => {
    // Имитируем, что до этого момента режим был выставлен рекордером под
    // запись (не под игру) — плеер обязан всё равно вернуть его в
    // пригодное для игры состояние сам, не полагаясь на то, что это уже
    // сделал кто-то извне.
    mockSetAudioModeAsync.mockClear();
    const renderer = renderPlayer(buildAttachment());

    await act(async () => {
      findPlayButton(renderer).props.onPress();
      await flush();
    });
    expect(mockSetAudioModeAsync).toHaveBeenLastCalledWith(PLAYBACK_AUDIO_MODE);

    act(() => {
      mockStatus = { ...mockStatus, isLoaded: true, playing: true };
      renderer.update(<VoiceMessagePlayer attachment={buildAttachment()} order={1} />);
    });
    await act(async () => {
      findPlayButton(renderer).props.onPress(); // пауза
      await flush();
    });
    mockSetAudioModeAsync.mockClear();

    act(() => {
      mockStatus = { ...mockStatus, playing: false };
      renderer.update(<VoiceMessagePlayer attachment={buildAttachment()} order={1} />);
    });
    await act(async () => {
      findPlayButton(renderer).props.onPress(); // снова play, источник уже загружен
      await flush();
    });

    expect(mockSetAudioModeAsync).toHaveBeenLastCalledWith(PLAYBACK_AUDIO_MODE);
  });
});
