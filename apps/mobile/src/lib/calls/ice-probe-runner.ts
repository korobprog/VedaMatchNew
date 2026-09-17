import { RTCPeerConnection, type RTCIceCandidate } from 'react-native-webrtc';
import type { ChatIceServerDto } from '@vedamatch/shared';
import {
  judgeStep,
  parseCandidate,
  type IceCandidateType,
  type ParsedCandidate,
  type ProbeStep,
  type StepOutcome,
  type StepResult,
} from './ice-probe';
import { normalizeIceServers } from './ice-server-normalize';

/**
 * Браузерная часть зонда: реальные `RTCPeerConnection`, здесь — из
 * react-native-webrtc. Не тестируется в jest-expo, поэтому здесь только
 * склейка — все решения в `ice-probe.ts`.
 *
 * Используются сеттеры `onicecandidate`/`ondatachannel`/`onmessage`, а не
 * `addEventListener`: в опубликованных типах react-native-webrtc 124.x
 * `RTCPeerConnection`/`RTCDataChannel` расширяют `EventTarget` из
 * `./vendor/event-target-shim`, а каталог `vendor` в пакет `lib/typescript`
 * не попал (проверено на 124.0.8) — `addEventListener` типами не виден.
 * Сеттеры объявлены на самих классах и работают.
 */

/** Не экспортируется из пакета отдельным типом — выводим из фабрики. */
type RTCDataChannel = ReturnType<RTCPeerConnection['createDataChannel']>;

interface IceCandidateEvent {
  candidate: RTCIceCandidate | null;
}

interface DataChannelEvent {
  channel: RTCDataChannel;
}

interface MessageEvent {
  data: string;
}

const GATHER_TIMEOUT_MS = 8_000;
const LOOPBACK_TIMEOUT_MS = 12_000;

/** Собрать кандидаты одного шага и решить, прошёл ли он. */
export async function runStep(step: ProbeStep): Promise<StepResult> {
  const started = Date.now();
  const pc = new RTCPeerConnection({
    iceServers: step.servers,
    // Шагу нужен только ответ сервера; host-кандидаты не мешают, но и не
    // засчитываются (см. judgeStep).
    iceTransportPolicy: step.expects === 'relay' ? 'relay' : 'all',
  });
  const collected: ParsedCandidate[] = [];

  const outcome = await new Promise<StepOutcome>((resolve) => {
    const timer = setTimeout(() => resolve('fail'), GATHER_TIMEOUT_MS);
    pc.onicecandidate = ((event: IceCandidateEvent) => {
      if (!event.candidate) {
        clearTimeout(timer);
        resolve(judgeStep(step, collected) ? 'ok' : 'fail');
        return;
      }
      const parsed = parseCandidate(event.candidate.candidate);
      if (!parsed) return;
      collected.push(parsed);
      // Первый подходящий кандидат — уже ответ; ждать конца сбора незачем.
      if (judgeStep(step, collected)) {
        clearTimeout(timer);
        resolve('ok');
      }
    }) as typeof pc.onicecandidate;
    pc.createDataChannel('probe');
    pc.createOffer()
      .then((offer) => pc.setLocalDescription(offer))
      .catch(() => {
        clearTimeout(timer);
        resolve('fail');
      });
  });

  pc.close();
  return {
    transport: step.transport,
    outcome,
    ms: outcome === 'ok' ? Date.now() - started : null,
  };
}

/**
 * Петля через релей: два соединения в приложении, обоим запрещено всё,
 * кроме relay, и по каналу данных проходит сообщение. Это единственная
 * проверка, что TURN не просто отвечает, а действительно пропускает
 * трафик — allocation без permission тоже даёт relay-кандидат.
 */
export async function runLoopback(servers: ChatIceServerDto[]): Promise<StepOutcome> {
  const turnOnly = servers.filter((s) => s.urls.some((u) => u.startsWith('turn')));
  if (turnOnly.length === 0) return 'fail';

  const a = new RTCPeerConnection({ iceServers: turnOnly, iceTransportPolicy: 'relay' });
  const b = new RTCPeerConnection({ iceServers: turnOnly, iceTransportPolicy: 'relay' });
  a.onicecandidate = ((event: IceCandidateEvent) => {
    if (event.candidate) void b.addIceCandidate(event.candidate).catch(() => undefined);
  }) as typeof a.onicecandidate;
  b.onicecandidate = ((event: IceCandidateEvent) => {
    if (event.candidate) void a.addIceCandidate(event.candidate).catch(() => undefined);
  }) as typeof b.onicecandidate;

  const result = await new Promise<StepOutcome>((resolve) => {
    const timer = setTimeout(() => resolve('fail'), LOOPBACK_TIMEOUT_MS);
    b.ondatachannel = ((event: DataChannelEvent) => {
      event.channel.onmessage = ((msg: MessageEvent) => {
        if (msg.data === 'ping') {
          clearTimeout(timer);
          resolve('ok');
        }
      }) as typeof event.channel.onmessage;
    }) as typeof b.ondatachannel;
    const channel = a.createDataChannel('loop');
    channel.onopen = (() => channel.send('ping')) as typeof channel.onopen;

    a.createOffer()
      .then((offer) => a.setLocalDescription(offer))
      .then(() => b.setRemoteDescription(a.localDescription!))
      .then(() => b.createAnswer())
      .then((answer) => b.setLocalDescription(answer))
      .then(() => a.setRemoteDescription(b.localDescription!))
      .catch(() => {
        clearTimeout(timer);
        resolve('fail');
      });
  });

  a.close();
  b.close();
  return result;
}

export interface AnswererProbeResult {
  /** Уникальные типы кандидатов, которые отдал ОТВЕТЧИК (без повторов,
   *  без порядка). */
  candidateTypes: IceCandidateType[];
  /** Сколько мс от `setRemoteDescription` до конца сбора (`candidate: null`
   *  или таймаут `GATHER_TIMEOUT_MS`). */
  ms: number;
  /** Сбор оборвался по таймауту (8с), не дойдя до `candidate: null`. */
  timedOut: boolean;
}

/**
 * «Проверка как у звонка» (VED-222, живая проверка BUG C, запрошено
 * координатором как детерминированный эксперимент): изолирует РОЛЬ
 * ответчика от содержимого offer'а конкретного сайта. Второе соединение
 * здесь настроено БУКВАЛЬНО так же, как `CallSession` в `webrtc-session.ts`
 * для входящего — те же нормализованные `iceServers`
 * (`ice-server-normalize.ts`), без `iceTransportPolicy`/`bundlePolicy`,
 * `onicecandidate` ставится ДО `setRemoteDescription`, дальше тот же
 * порядок (`setRemoteDescription` → `createAnswer` → `setLocalDescription`).
 * Первое соединение — не более чем источник реалистичного `offer` (свой
 * `iceServers` ему не нужен, его кандидаты не проверяются): ЕСЛИ ответчик
 * здесь тоже не наберёт srflx/relay — дело не в конкретном offer'е сайта
 * (`a=ice-lite`/`bundle-only`/т.п.), а в самой связке «ответчик + эти
 * `iceServers`» на этом телефоне/сборке react-native-webrtc.
 */
export async function runAnswererProbe(servers: ChatIceServerDto[]): Promise<AnswererProbeResult> {
  const offerer = new RTCPeerConnection({});
  offerer.createDataChannel('answerer-probe');
  const offer = await offerer.createOffer();
  await offerer.setLocalDescription(offer);

  const answerer = new RTCPeerConnection({ iceServers: normalizeIceServers(servers) });
  const collected: ParsedCandidate[] = [];
  const started = Date.now();
  const { timedOut } = await new Promise<{ timedOut: boolean }>((resolve) => {
    const timer = setTimeout(() => resolve({ timedOut: true }), GATHER_TIMEOUT_MS);
    answerer.onicecandidate = ((event: IceCandidateEvent) => {
      if (!event.candidate) {
        clearTimeout(timer);
        resolve({ timedOut: false });
        return;
      }
      const parsed = parseCandidate(event.candidate.candidate);
      if (parsed) collected.push(parsed);
    }) as typeof answerer.onicecandidate;
    answerer
      .setRemoteDescription({ type: 'offer', sdp: offer.sdp ?? '' })
      .then(() => answerer.createAnswer())
      .then((answer) => answerer.setLocalDescription(answer))
      .catch(() => {
        clearTimeout(timer);
        resolve({ timedOut: true });
      });
  });

  const ms = Date.now() - started;
  offerer.close();
  answerer.close();
  return { candidateTypes: [...new Set(collected.map((c) => c.type))], ms, timedOut };
}
