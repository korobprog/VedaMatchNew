"use client";

import type { ChatIceServerDto } from "@vedamatch/shared";
import {
  judgeStep,
  parseCandidate,
  type ParsedCandidate,
  type ProbeStep,
  type StepOutcome,
  type StepResult,
} from "./ice-probe";

/**
 * Браузерная часть зонда: реальные `RTCPeerConnection`. Не тестируется в
 * jsdom, поэтому здесь только склейка — все решения в `ice-probe.ts`.
 */

const GATHER_TIMEOUT_MS = 8_000;
const LOOPBACK_TIMEOUT_MS = 12_000;

/** Собрать кандидаты одного шага и решить, прошёл ли он. */
export async function runStep(step: ProbeStep): Promise<StepResult> {
  const started = performance.now();
  const pc = new RTCPeerConnection({
    iceServers: step.servers,
    // Шагу нужен только ответ сервера; host-кандидаты не мешают, но и не
    // засчитываются (см. judgeStep).
    iceTransportPolicy: step.expects === "relay" ? "relay" : "all",
  });
  const collected: ParsedCandidate[] = [];

  const outcome = await new Promise<StepOutcome>((resolve) => {
    const timer = setTimeout(() => resolve("fail"), GATHER_TIMEOUT_MS);
    pc.onicecandidate = (event) => {
      if (!event.candidate) {
        clearTimeout(timer);
        resolve(judgeStep(step, collected) ? "ok" : "fail");
        return;
      }
      const parsed = parseCandidate(event.candidate.candidate);
      if (!parsed) return;
      collected.push(parsed);
      // Первый подходящий кандидат — уже ответ; ждать конца сбора незачем.
      if (judgeStep(step, collected)) {
        clearTimeout(timer);
        resolve("ok");
      }
    };
    pc.createDataChannel("probe");
    pc.createOffer()
      .then((offer) => pc.setLocalDescription(offer))
      .catch(() => {
        clearTimeout(timer);
        resolve("fail");
      });
  });

  pc.close();
  return {
    transport: step.transport,
    outcome,
    ms: outcome === "ok" ? Math.round(performance.now() - started) : null,
  };
}

/**
 * Петля через релей: два соединения в одной вкладке, обоим запрещено всё,
 * кроме relay, и по каналу данных проходит сообщение. Это единственная
 * проверка, что TURN не просто отвечает, а действительно пропускает
 * трафик — allocation без permission тоже даёт relay-кандидат.
 */
export async function runLoopback(
  servers: ChatIceServerDto[],
): Promise<StepOutcome> {
  const turnOnly = servers.filter((s) =>
    s.urls.some((u) => u.startsWith("turn")),
  );
  if (turnOnly.length === 0) return "fail";

  const a = new RTCPeerConnection({
    iceServers: turnOnly,
    iceTransportPolicy: "relay",
  });
  const b = new RTCPeerConnection({
    iceServers: turnOnly,
    iceTransportPolicy: "relay",
  });
  a.onicecandidate = (e) => {
    if (e.candidate) void b.addIceCandidate(e.candidate).catch(() => undefined);
  };
  b.onicecandidate = (e) => {
    if (e.candidate) void a.addIceCandidate(e.candidate).catch(() => undefined);
  };

  const result = await new Promise<StepOutcome>((resolve) => {
    const timer = setTimeout(() => resolve("fail"), LOOPBACK_TIMEOUT_MS);
    b.ondatachannel = (event) => {
      event.channel.onmessage = (msg) => {
        if (msg.data === "ping") {
          clearTimeout(timer);
          resolve("ok");
        }
      };
    };
    const channel = a.createDataChannel("loop");
    channel.onopen = () => channel.send("ping");

    a.createOffer()
      .then((offer) => a.setLocalDescription(offer))
      .then(() => b.setRemoteDescription(a.localDescription!))
      .then(() => b.createAnswer())
      .then((answer) => b.setLocalDescription(answer))
      .then(() => a.setRemoteDescription(b.localDescription!))
      .catch(() => {
        clearTimeout(timer);
        resolve("fail");
      });
  });

  a.close();
  b.close();
  return result;
}
