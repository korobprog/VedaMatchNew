import { describe, expect, it } from "vitest";
import {
  buildProbePlan,
  formatSummary,
  judgeStep,
  parseCandidate,
} from "./ice-probe";

describe("parseCandidate", () => {
  it("разбирает host, srflx и relay из строки SDP", () => {
    expect(
      parseCandidate(
        "candidate:1 1 udp 2122260223 192.168.1.5 50000 typ host generation 0",
      ),
    ).toEqual({ type: "host", protocol: "udp" });
    expect(
      parseCandidate(
        "a=candidate:2 1 udp 1686052607 85.10.1.1 50001 typ srflx raddr 192.168.1.5 rport 50000",
      ),
    ).toEqual({ type: "srflx", protocol: "udp" });
    expect(
      parseCandidate(
        "candidate:3 1 udp 41885439 45.150.9.229 49200 typ relay raddr 85.10.1.1 rport 50001",
      ),
    ).toEqual({ type: "relay", protocol: "udp" });
  });

  it("не кандидат — null", () => {
    expect(parseCandidate("")).toBeNull();
    expect(parseCandidate("a=end-of-candidates")).toBeNull();
    expect(parseCandidate("candidate:1 1 sctp 1 1.1.1.1 1 typ host")).toBeNull();
  });
});

describe("buildProbePlan", () => {
  const servers = [
    { urls: ["stun:turn.example.org:3478"] },
    { urls: ["stun:stun.l.google.com:19302"] },
    {
      urls: [
        "turn:turn.example.org:3478?transport=udp",
        "turn:turn.example.org:3478?transport=tcp",
        "turns:turn.example.org:5349?transport=tcp",
      ],
      username: "1:u",
      credential: "c",
    },
  ];

  it("по одному шагу на транспорт, TURN разнесён по отдельным соединениям", () => {
    const plan = buildProbePlan(servers);
    expect(plan.map((s) => s.transport)).toEqual([
      "stun",
      "relay-udp",
      "relay-tcp",
      "relay-tls",
    ]);
    const tls = plan.find((s) => s.transport === "relay-tls")!;
    expect(tls.servers).toEqual([
      {
        urls: ["turns:turn.example.org:5349?transport=tcp"],
        username: "1:u",
        credential: "c",
      },
    ]);
    expect(tls.expects).toBe("relay");
  });

  it("первый STUN берётся свой, второй не дублирует шаг", () => {
    const plan = buildProbePlan(servers);
    const stun = plan.filter((s) => s.transport === "stun");
    expect(stun).toHaveLength(1);
    expect(stun[0].servers[0].urls).toEqual(["stun:turn.example.org:3478"]);
    expect(stun[0].expects).toBe("srflx");
  });

  it("без TURN в плане только STUN", () => {
    expect(
      buildProbePlan([{ urls: ["stun:stun.l.google.com:19302"] }]).map(
        (s) => s.transport,
      ),
    ).toEqual(["stun"]);
  });
});

describe("judgeStep", () => {
  const relayStep = buildProbePlan([
    { urls: ["turn:h:3478?transport=udp"], username: "u", credential: "c" },
  ])[0];

  it("relay-шаг успешен только при relay-кандидате", () => {
    expect(judgeStep(relayStep, [{ type: "host", protocol: "udp" }])).toBe(false);
    expect(judgeStep(relayStep, [{ type: "relay", protocol: "udp" }])).toBe(true);
  });
});

describe("formatSummary", () => {
  it("даёт строку markdown-таблицы в порядке колонок README", () => {
    expect(
      formatSummary(
        [
          { transport: "stun", outcome: "ok", ms: 40 },
          { transport: "relay-udp", outcome: "fail", ms: null },
          { transport: "relay-tcp", outcome: "ok", ms: 300 },
        ],
        "ok",
      ),
    ).toBe("да | нет | да | — | да");
  });
});
