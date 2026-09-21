import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import type { ChatApi } from '@/lib/chat/chat-api';
import { VoiceRecorderControl } from './voice-recorder-control';
import { isRecordingActive, resetVoiceRecordingGuardForTests } from '@/lib/chat/voice/voice-recording-guard';

/**
 * Регресс на feedback-002, блокирующий п.1/2: раньше запись останавливалась
 * ТОЛЬКО в cleanup обычного `useEffect` при размонтировании — и полагалась
 * на неверное представление о порядке вызова cleanup-функций React (было
 * заявлено «обратный порядку регистрации», на деле — порядок регистрации,
 * подтверждено эмпирически самим оценщиком). Теперь основная защита —
 * `useFocusEffect`, чей cleanup React Navigation вызывает на `blur`,
 * отдельно от размонтирования и не завязанный на порядок эффектов
 * `useAudioRecorder`. Этот тест ловит именно это: без вызова `recorder.stop()`
 * на blur он бы не проходил.
 */

const mockRecorder = {
  uri: 'file:///tmp/voice-test.m4a',
  currentTime: 3,
  record: jest.fn(),
  stop: jest.fn().mockResolvedValue(undefined),
  prepareToRecordAsync: jest.fn().mockResolvedValue(undefined),
};

// `jest.fn()` отдельными переменными (не инлайн в фабрике) — переопределяем
// поведение по тестам: живая проверка сборки 5004 воспроизводится именно
// поведением этих вызовов (бросает/зависает) МЕЖДУ `recorder.record()` и
// обновлением состояния в `start()`.
const mockSetAudioModeAsync = jest.fn().mockResolvedValue(undefined);
const mockConfirmTap = jest.fn();

jest.mock('expo-audio', () => ({
  __esModule: true,
  useAudioRecorder: jest.fn(() => mockRecorder),
  useAudioRecorderState: jest.fn(() => ({
    canRecord: true,
    isRecording: true,
    durationMillis: 3000,
    mediaServicesDidReset: false,
    metering: -20,
    url: mockRecorder.uri,
  })),
  requestRecordingPermissionsAsync: jest.fn().mockResolvedValue({ granted: true }),
  setAudioModeAsync: (...args: unknown[]) => mockSetAudioModeAsync(...args),
}));

jest.mock('expo-file-system/legacy', () => ({
  deleteAsync: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/lib/feedback', () => ({
  __esModule: true,
  confirmTap: (...args: unknown[]) => mockConfirmTap(...args),
  longPressTap: jest.fn(),
}));

let focusCleanup: (() => void) | undefined;

jest.mock('expo-router', () => ({
  __esModule: true,
  // Мок не через реальный `useEffect`: компонент в тесте держит фокус с
  // первого и единственного рендера, нас интересует только cleanup,
  // возвращаемый эффектом (он и есть проверяемое поведение — «стоп на blur»).
  useFocusEffect: jest.fn((effect: () => (() => void) | void) => {
    focusCleanup = effect() ?? undefined;
  }),
}));

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('VoiceRecorderControl — остановка записи при уходе с экрана', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRecorder.record.mockReset();
    mockRecorder.stop.mockReset().mockResolvedValue(undefined);
    mockRecorder.prepareToRecordAsync.mockReset().mockResolvedValue(undefined);
    mockSetAudioModeAsync.mockReset().mockResolvedValue(undefined);
    mockConfirmTap.mockReset();
    resetVoiceRecordingGuardForTests();
    focusCleanup = undefined;
  });

  it('recorder.stop() вызывается на blur навигации, пока запись ещё активна', async () => {
    const chatApi = { upload: jest.fn() } as unknown as ChatApi;
    let renderer!: ReactTestRenderer;

    await act(async () => {
      renderer = create(<VoiceRecorderControl conversationId="c1" chatApi={chatApi} onSent={jest.fn()} />);
    });

    const micButton = renderer.root.findByProps({ accessibilityLabel: 'Записать голосовое' });
    await act(async () => {
      micButton.props.onPress();
    });
    await flush();

    // Запись действительно началась — рендерится «Отменить запись».
    expect(() => renderer.root.findByProps({ accessibilityLabel: 'Отменить запись' })).not.toThrow();
    expect(mockRecorder.record).toHaveBeenCalledTimes(1);
    expect(mockRecorder.stop).not.toHaveBeenCalled();

    // Экран теряет фокус (пример: системное «назад» из переписки) — до
    // размонтирования компонента вообще.
    expect(focusCleanup).toBeInstanceOf(Function);
    await act(async () => {
      focusCleanup?.();
    });
    await flush();

    expect(mockRecorder.stop).toHaveBeenCalledTimes(1);
  });

  it('blur без активной записи ничего не останавливает', async () => {
    const chatApi = { upload: jest.fn() } as unknown as ChatApi;
    await act(async () => {
      create(<VoiceRecorderControl conversationId="c1" chatApi={chatApi} onSent={jest.fn()} />);
    });

    expect(focusCleanup).toBeInstanceOf(Function);
    await act(async () => {
      focusCleanup?.();
    });
    await flush();

    expect(mockRecorder.stop).not.toHaveBeenCalled();
  });
});

/**
 * Живая проверка сборки 5004 (Samsung A51, com.vedamatch.app): на честном
 * холодном старте первое же нажатие «Записать голосовое» давало в logcat
 * `MediaRecorderJNI: start` (нативная запись реально пошла), но композер не
 * менялся НИ НА КАДР — ни панели записи, ни экрана ошибки, кнопка
 * оставалась подписана «Записать голосовое». Повторный тап останавливал и
 * ОТПРАВЛЯЛ невидимо накопленную запись. Причина — в `start()`
 * (`voice-recorder-control.tsx`) между успешным `recorder.record()` и
 * `setState(...)` стоял `confirmTap()` (вибрация): если он бросал, поток
 * улетал в `catch`, который ДО фикса сначала `await restoreAudioMode()`
 * (`setAudioModeAsync`), и только потом менял состояние — если этот промис
 * не разрешался вовсе (не обязательно кидал!), `setState` не выполнялся
 * НИКОГДА.
 */
describe('VoiceRecorderControl — состояние UI не может разойтись с реально запущенным рекордером', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRecorder.record.mockReset();
    mockRecorder.stop.mockReset().mockResolvedValue(undefined);
    mockRecorder.prepareToRecordAsync.mockReset().mockResolvedValue(undefined);
    mockSetAudioModeAsync.mockReset().mockResolvedValue(undefined);
    mockConfirmTap.mockReset();
    resetVoiceRecordingGuardForTests();
    focusCleanup = undefined;
  });

  it('после успешного record() состояние — recording, даже если confirmTap бросает синхронно (первая вибрация за сессию)', async () => {
    mockConfirmTap.mockImplementation(() => {
      throw new Error('AndroidHaptics недоступен');
    });
    const chatApi = { upload: jest.fn() } as unknown as ChatApi;
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(<VoiceRecorderControl conversationId="c1" chatApi={chatApi} onSent={jest.fn()} />);
    });

    const micButton = renderer.root.findByProps({ accessibilityLabel: 'Записать голосовое' });
    await act(async () => {
      micButton.props.onPress();
    });
    await flush();

    // Панель записи ДОЛЖНА появиться — сбой вибрации не откатывает уже
    // состоявшийся нативный старт.
    expect(() => renderer.root.findByProps({ accessibilityLabel: 'Отменить запись' })).not.toThrow();
    expect(() => renderer.root.findByProps({ accessibilityLabel: 'Записать голосовое' })).toThrow();
    expect(mockRecorder.record).toHaveBeenCalledTimes(1);
    expect(mockRecorder.stop).not.toHaveBeenCalled();
    expect(isRecordingActive()).toBe(true);
  });

  it('после успешного record() состояние — recording, даже если setAudioModeAsync внутри записи зависает (промис никогда не разрешается)', async () => {
    // Первый вызов (из `applyRecordingAudioMode`, allowsRecording: true) —
    // проходит штатно; сценарий про зависание относится к ДРУГОМУ вызову
    // (`restoreAudioMode`, allowsRecording: false), которого на успешном
    // пути вообще не происходит, — только имитируем, что «фон» реально
    // может зависнуть, а стартовая ветка от него не зависит вовсе.
    mockSetAudioModeAsync.mockImplementation(
      (opts: { allowsRecording?: boolean }) => (opts.allowsRecording ? Promise.resolve(undefined) : new Promise(() => {})),
    );
    const chatApi = { upload: jest.fn() } as unknown as ChatApi;
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(<VoiceRecorderControl conversationId="c1" chatApi={chatApi} onSent={jest.fn()} />);
    });

    const micButton = renderer.root.findByProps({ accessibilityLabel: 'Записать голосовое' });
    await act(async () => {
      micButton.props.onPress();
    });
    await flush();

    expect(() => renderer.root.findByProps({ accessibilityLabel: 'Отменить запись' })).not.toThrow();
    expect(mockRecorder.record).toHaveBeenCalledTimes(1);
  });

  it('провал самого record() останавливает рекордер и показывает ошибку, даже если restoreAudioMode внутри catch зависает навсегда', async () => {
    mockRecorder.record.mockImplementation(() => {
      throw new Error('MediaRecorder: start failed');
    });
    // `applyRecordingAudioMode` (allowsRecording: true) успевает пройти до
    // броска в `record()`; висящий промис имитирует именно ветку
    // `restoreAudioMode` (allowsRecording: false) внутри `catch` —
    // сценарий, который раньше делал сбой невидимым навсегда.
    mockSetAudioModeAsync.mockImplementation(
      (opts: { allowsRecording?: boolean }) => (opts.allowsRecording ? Promise.resolve(undefined) : new Promise(() => {})),
    );
    const chatApi = { upload: jest.fn() } as unknown as ChatApi;
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(<VoiceRecorderControl conversationId="c1" chatApi={chatApi} onSent={jest.fn()} />);
    });

    const micButton = renderer.root.findByProps({ accessibilityLabel: 'Записать голосовое' });
    await act(async () => {
      micButton.props.onPress();
    });
    await flush();

    // Состояние — ошибка (не молчаливый нетронутый `idle`), рекордер
    // остановлен, глобальный флаг активной записи снят — несмотря на то,
    // что `restoreAudioMode()` внутри `catch` никогда не разрешится.
    expect(() => renderer.root.findByProps({ accessibilityLabel: 'Понятно' })).not.toThrow();
    expect(mockRecorder.stop).toHaveBeenCalledTimes(1);
    expect(isRecordingActive()).toBe(false);
  });
});
