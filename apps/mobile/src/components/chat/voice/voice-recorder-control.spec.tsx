import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import type { ChatApi } from '@/lib/chat/chat-api';
import { VoiceRecorderControl } from './voice-recorder-control';

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
  setAudioModeAsync: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('expo-file-system/legacy', () => ({
  deleteAsync: jest.fn().mockResolvedValue(undefined),
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
