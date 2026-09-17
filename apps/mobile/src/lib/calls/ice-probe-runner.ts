import { mediaDevices, RTCPeerConnection, type MediaStream, type RTCIceCandidate } from 'react-native-webrtc';
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

export interface AnswererProbeOptions {
  /**
   * Захватить микрофон и вызвать `addTrack()` на ответчике ДО
   * `setRemoteDescription` — ровно так, как `call-provider.tsx#accept()`
   * готовит `CallSession` (`session.startLocalMedia()` идёт раньше, чем
   * приходит offer, ради задержки ответа). Живая проверка BUG C (VED-222):
   * это единственная РЕАЛЬНАЯ, ещё не проверенная разница между этой пробой
   * (без трека — уже подтверждённо получает host/srflx/relay) и настоящим
   * звонком — с этим флагом офферер получает `m=audio` через
   * `addTransceiver('audio', {direction:'recvonly'})` (без реального
   * трека — только чтобы в offer было что реконцилировать), иначе
   * `addTrack` на ответчике был бы не с чем сопоставлять.
   */
  addLocalTrackFirst?: boolean;
  /**
   * Применить кандидаты офферера к ответчику СРАЗУ после
   * `setRemoteDescription`, ещё ДО `createAnswer`/`setLocalDescription` —
   * воспроизводит СТАРЫЙ (до правки BUG C, VED-222) порядок
   * `CallSession.handleSignal`: буфер `pending` сбрасывался именно в этот
   * момент, а не после `setLocalDescription` ответа. Офферер и ответчик
   * здесь оба на одном устройстве — не настоящая LAN другого пира, но
   * порядок вызовов и характер адресов (быстро проверяемые, локальные)
   * тот же самый, который и проверяется этим экспериментом.
   */
  applyRemoteCandidateBeforeAnswer?: boolean;
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
export async function runAnswererProbe(
  servers: ChatIceServerDto[],
  options: AnswererProbeOptions = {},
): Promise<AnswererProbeResult> {
  const offerer = new RTCPeerConnection({});
  const offererCandidates: string[] = [];
  if (options.applyRemoteCandidateBeforeAnswer) {
    offerer.onicecandidate = ((event: IceCandidateEvent) => {
      if (event.candidate) offererCandidates.push(event.candidate.candidate);
    }) as typeof offerer.onicecandidate;
  }
  if (options.addLocalTrackFirst) offerer.addTransceiver('audio', { direction: 'recvonly' });
  else offerer.createDataChannel('answerer-probe');
  const offer = await offerer.createOffer();
  await offerer.setLocalDescription(offer);

  if (options.applyRemoteCandidateBeforeAnswer) {
    // Подождать хотя бы один кандидат офферера — тот же порядок, что у
    // настоящего звонка: удалённые кандидаты уже лежат в буфере к моменту,
    // когда обрабатывается offer. На loopback обычно доли секунды.
    const deadline = Date.now() + 2000;
    while (offererCandidates.length === 0 && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  }

  const answerer = new RTCPeerConnection({ iceServers: normalizeIceServers(servers) });
  let localStream: MediaStream | null = null;
  if (options.addLocalTrackFirst) {
    localStream = await mediaDevices.getUserMedia({ audio: true });
    for (const track of localStream.getTracks()) answerer.addTrack(track, localStream);
  }
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
      .then(async () => {
        // Старый (до правки BUG C) порядок `CallSession.handleSignal`:
        // кандидаты применяются СРАЗУ после `setRemoteDescription`, ещё до
        // `createAnswer`/`setLocalDescription` — тут и проверяется, что
        // именно этот порядок обрывает собственный гатеринг.
        if (options.applyRemoteCandidateBeforeAnswer) {
          for (const candidate of offererCandidates) {
            await answerer
              .addIceCandidate({ candidate, sdpMid: '0', sdpMLineIndex: 0 })
              .catch(() => undefined);
          }
        }
      })
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
  for (const track of localStream?.getTracks() ?? []) track.stop();
  return { candidateTypes: [...new Set(collected.map((c) => c.type))], ms, timedOut };
}
