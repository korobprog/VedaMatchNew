import type { ChatIceServerDto } from "@vedamatch/shared";

/**
 * Чистая часть зонда ICE (страница /chat/calls/probe, этап 0 плана
 * звонков). Разбор кандидатов и план проверок вынесены сюда и покрыты
 * тестом; сам `RTCPeerConnection` живёт в `ice-probe-runner.ts` и в jsdom
 * не запускается.
 */

export type IceCandidateType = "host" | "srflx" | "prflx" | "relay";

export interface ParsedCandidate {
  type: IceCandidateType;
  /** Транспорт кандидата к собеседнику; у relay это всегда udp. */
  protocol: "udp" | "tcp";
}

/** Строка `candidate:...` из SDP → тип и транспорт. null — не кандидат. */
export function parseCandidate(line: string): ParsedCandidate | null {
  const parts = line.replace(/^a=/, "").trim().split(/\s+/);
  if (!parts[0]?.startsWith("candidate:") || parts.length < 8) return null;
  const protocol = parts[2]?.toLowerCase();
  const typIndex = parts.indexOf("typ");
  const type = typIndex >= 0 ? parts[typIndex + 1] : undefined;
  if (protocol !== "udp" && protocol !== "tcp") return null;
  if (type !== "host" && type !== "srflx" && type !== "prflx" && type !== "relay")
    return null;
  return { type, protocol };
}

export type ProbeTransport = "stun" | "relay-udp" | "relay-tcp" | "relay-tls";

export interface ProbeStep {
  transport: ProbeTransport;
  label: string;
  /** Серверы для отдельного `RTCPeerConnection` этого шага. */
  servers: ChatIceServerDto[];
  /** Какой тип кандидата считается успехом шага. */
  expects: IceCandidateType;
}

const LABELS: Record<ProbeTransport, string> = {
  stun: "STUN: свой внешний адрес",
  "relay-udp": "TURN по UDP",
  "relay-tcp": "TURN по TCP",
  "relay-tls": "TURN по TLS",
};

function transportOf(url: string): ProbeTransport | null {
  if (url.startsWith("stun:")) return "stun";
  if (url.startsWith("turns:")) return "relay-tls";
  if (!url.startsWith("turn:")) return null;
  return /transport=tcp/i.test(url) ? "relay-tcp" : "relay-udp";
}

/**
 * Один шаг на транспорт, а не одно соединение на всё: браузер собирает
 * кандидаты параллельно и не говорит, через какой из URL пришёл relay
 * (в Firefox `relayProtocol` нет вовсе). Разнеся URL по отдельным
 * соединениям, получаем честный ответ по каждому.
 */
export function buildProbePlan(iceServers: ChatIceServerDto[]): ProbeStep[] {
  const byTransport = new Map<ProbeTransport, ChatIceServerDto>();
  for (const server of iceServers) {
    for (const url of server.urls) {
      const transport = transportOf(url);
      if (!transport || byTransport.has(transport)) continue;
      byTransport.set(transport, {
        urls: [url],
        username: server.username,
        credential: server.credential,
      });
    }
  }
  const order: ProbeTransport[] = ["stun", "relay-udp", "relay-tcp", "relay-tls"];
  return order
    .filter((t) => byTransport.has(t))
    .map((transport) => ({
      transport,
      label: LABELS[transport],
      servers: [byTransport.get(transport)!],
      expects: transport === "stun" ? "srflx" : "relay",
    }));
}

export type StepOutcome = "ok" | "fail" | "pending";

export interface StepResult {
  transport: ProbeTransport;
  outcome: StepOutcome;
  /** Сколько миллисекундами дождались нужного кандидата. */
  ms: number | null;
}

/** Успех шага: среди собранных кандидатов есть ожидаемый тип. */
export function judgeStep(
  step: ProbeStep,
  candidates: ParsedCandidate[],
): boolean {
  return candidates.some((c) => c.type === step.expects);
}

/**
 * Итоговая строка для таблицы этапа 0 — то, что человек копирует в
 * README рядом с coturn. Формат намеренно плоский: его вставляют в
 * markdown-таблицу руками.
 */
export function formatSummary(
  results: StepResult[],
  loopback: StepOutcome,
): string {
  const mark = (o: StepOutcome) =>
    o === "ok" ? "да" : o === "fail" ? "нет" : "—";
  const cell = (t: ProbeTransport) =>
    mark(results.find((r) => r.transport === t)?.outcome ?? "pending");
  return [
    cell("stun"),
    cell("relay-udp"),
    cell("relay-tcp"),
    cell("relay-tls"),
    mark(loopback),
  ].join(" | ");
}
