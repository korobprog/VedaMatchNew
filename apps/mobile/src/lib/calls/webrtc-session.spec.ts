import type { ChatCallSignal } from '@vedamatch/shared';

/**
 * «Тест связки» из feedback-002.md (VED-261, блокирующий п.1) — перенос
 * `apps/web/src/components/chat/calls/webrtc-session.spec.ts`: проверяет
 * `CallSession.handleSignal` целиком, с реальной (хоть и фальшивой) машиной
 * состояний `RTCSignalingState`, а не только `decideSdpApply` в изоляции
 * (`webrtc-signal-guard.spec.ts`).
 *
 * `react-native-webrtc` целиком замокан — на телефоне это нативный модуль,
 * которого в jest-expo нет (см. докстринг `webrtc-session.ts`: «не
 * тестируется в jest-expo: склейка вокруг нативного модуля»); мок даёт ровно
 * тот минимум, что `CallSession` реально вызывает. Классы-заглушки объявлены
 * ПРЯМО ВНУТРИ фабрики `jest.mock(...)`, а не снаружи со ссылкой по имени:
 * `babel-plugin-jest-hoist` поднимает и сам вызов `jest.mock`, и последующий
 * `import` этого файла (`./webrtc-session`, который транзитивно требует
 * `react-native-webrtc`) выше обычных объявлений `class` — внешний класс в
 * момент фактического вызова фабрики ещё не инициализирован (TDZ), и `new
 * RTCPeerConnection(...)` внутри `CallSession` падает с «is not a
 * constructor», а не с ожидаемым поведением заглушки. Проверено эмпирически
 * на этом файле, а не по документации.
 *
 * Разделение ответственности с сервером — как на сайте: `claimClientSignal`
 * не даёт partial-success ретраю доставить ОДИН И ТОТ ЖЕ офер дважды, этот
 * файл проверяет вторую, независимую линию защиты — `signalingState`. Она
 * полностью закрывает сценарий из багрепорта («ответ второй стороны
 * долетает до звонящего, чей `pc` уже `stable`») — ниже это тест «answer в
 * stable игнорируется» — и симметричный случай glare для offer'а.
 */

interface FakeSdp {
  type: 'offer' | 'answer';
  sdp: string;
}

/** Структурная форма фальшивого `pc` — только то, что читают тесты. */
interface FakePc {
  signalingState: string;
  setRemoteDescriptionCalls: FakeSdp[];
  createAnswerCalls: number;
  createOfferCalls: number;
}

jest.mock('react-native-webrtc', () => {
  class MockRTCPeerConnection {
    signalingState = 'stable';
    connectionState = 'new';
    onicecandidate: unknown = null;
    ontrack: unknown = null;
    onconnectionstatechange: unknown = null;

    setRemoteDescriptionCalls: FakeSdp[] = [];
    createAnswerCalls = 0;
    createOfferCalls = 0;

    addTrack(): void {}

    async createOffer(): Promise<FakeSdp> {
      this.createOfferCalls += 1;
      return { type: 'offer', sdp: 'offer-sdp' };
    }

    async createAnswer(): Promise<FakeSdp> {
      this.createAnswerCalls += 1;
      return { type: 'answer', sdp: 'answer-sdp' };
    }

    async setLocalDescription(desc: FakeSdp): Promise<void> {
      if (desc.type === 'offer') this.signalingState = 'have-local-offer';
      else if (desc.type === 'answer') this.signalingState = 'stable';
    }

    /**
     * Имитирует реальный `RTCPeerConnection`: бросает в состояниях, в
     * которых `handleSignal` НЕ ДОЛЖЕН вызывать этот метод вовсе (guard
     * обязан отсечь их раньше) — тест ловит регрессию в самом guard'е, а не
     * только проверяет его изолированно.
     */
    async setRemoteDescription(desc: FakeSdp): Promise<void> {
      if (desc.type === 'answer' && this.signalingState !== 'have-local-offer')
        throw new Error(`InvalidStateError: Called in wrong state: ${this.signalingState}`);
      if (desc.type === 'offer' && this.signalingState === 'have-local-offer')
        throw new Error('InvalidStateError: glare');
      this.setRemoteDescriptionCalls.push(desc);
      if (desc.type === 'offer') this.signalingState = 'have-remote-offer';
      else this.signalingState = 'stable';
    }

    async addIceCandidate(): Promise<void> {}

    async getStats(): Promise<Map<string, unknown>> {
      return new Map();
    }

    close(): void {
      this.signalingState = 'closed';
    }
  }

  class MockMediaStream {
    getTracks() {
      return [];
    }
    getAudioTracks() {
      return [];
    }
    getVideoTracks() {
      return [];
    }
  }

  return {
    __esModule: true,
    RTCPeerConnection: MockRTCPeerConnection,
    MediaStream: MockMediaStream,
    mediaDevices: { getUserMedia: jest.fn() },
  };
});

import { CallSession, type SessionHandlers } from './webrtc-session';

function handlers(): SessionHandlers & { sent: ChatCallSignal[] } {
  const sent: ChatCallSignal[] = [];
  return {
    sent,
    onSignal: (signal) => sent.push(signal),
    onRemoteStream: () => undefined,
    onConnected: () => undefined,
    onDisconnected: () => undefined,
    onFailed: () => undefined,
  };
}

function pcOf(session: CallSession): FakePc {
  return (session as unknown as { pc: FakePc }).pc;
}

describe('CallSession.handleSignal — таблица состояний signalingState (VED-261, feedback-002)', () => {
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('offer в stable применяется и порождает ровно один answer', async () => {
    const h = handlers();
    const session = new CallSession([], 'callee', h);
    const pc = pcOf(session);

    await session.handleSignal({ kind: 'sdp', sdp: { type: 'offer', sdp: 'remote-offer' } });

    expect(pc.setRemoteDescriptionCalls).toHaveLength(1);
    expect(pc.createAnswerCalls).toBe(1);
    expect(h.sent).toEqual([{ kind: 'sdp', sdp: { type: 'answer', sdp: 'answer-sdp' } }]);
  });

  it('answer в stable (поздний/повторный ответ после уже завершённых переговоров) игнорируется без исключения', async () => {
    const h = handlers();
    const session = new CallSession([], 'caller', h);
    const pc = pcOf(session);
    expect(pc.signalingState).toBe('stable');
    // Конструктор сам логирует диагностику (конфигурация iceServers) —
    // сбрасываем счётчик, интересен только warn от самого guard'а.
    warnSpy.mockClear();

    await expect(
      session.handleSignal({ kind: 'sdp', sdp: { type: 'answer', sdp: 'stray-answer' } }),
    ).resolves.toBeUndefined();

    expect(pc.setRemoteDescriptionCalls).toHaveLength(0);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(String(warnSpy.mock.calls[0][0])).toContain('answer');
  });

  it('answer после своего offer (have-local-offer) применяется как обычно', async () => {
    const h = handlers();
    const session = new CallSession([], 'caller', h);
    await session.makeOffer();
    const pc = pcOf(session);
    expect(pc.signalingState).toBe('have-local-offer');

    await session.handleSignal({ kind: 'sdp', sdp: { type: 'answer', sdp: 'real-answer' } });

    expect(pc.setRemoteDescriptionCalls).toEqual([{ type: 'answer', sdp: 'real-answer' }]);
  });

  it('offer, пришедший пока мы сами ждём ответа на свой offer (glare), игнорируется', async () => {
    const h = handlers();
    const session = new CallSession([], 'caller', h);
    await session.makeOffer();
    const pc = pcOf(session);
    expect(pc.signalingState).toBe('have-local-offer');
    warnSpy.mockClear();

    await expect(
      session.handleSignal({ kind: 'sdp', sdp: { type: 'offer', sdp: 'crossed-offer' } }),
    ).resolves.toBeUndefined();

    expect(pc.setRemoteDescriptionCalls).toHaveLength(0);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(String(warnSpy.mock.calls[0][0])).toContain('glare');
  });

  it('второй offer до собственного ответа на первый (have-remote-offer) — валиден по спецификации, применяется', async () => {
    const h = handlers();
    const session = new CallSession([], 'callee', h);
    const pc = pcOf(session);
    pc.signalingState = 'have-remote-offer';

    await session.handleSignal({ kind: 'sdp', sdp: { type: 'offer', sdp: 'second-offer' } });

    expect(pc.setRemoteDescriptionCalls).toEqual([{ type: 'offer', sdp: 'second-offer' }]);
  });
});
