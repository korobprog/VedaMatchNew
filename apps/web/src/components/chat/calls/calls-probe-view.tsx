"use client";

import { useCallback, useState } from "react";
import type { ChatIceServersState } from "@vedamatch/shared";
import { API_URL, apiFetch } from "@/lib/http-client";
import {
  buildProbePlan,
  formatSummary,
  type ProbeStep,
  type StepOutcome,
  type StepResult,
} from "./ice-probe";
import { runLoopback, runStep } from "./ice-probe-runner";

type Phase = "idle" | "loading" | "running" | "done" | "error";

const OUTCOME_LABEL: Record<StepOutcome, string> = {
  ok: "доступен",
  fail: "нет",
  pending: "…",
};

/**
 * Зонд сети для этапа 0 плана звонков: с какого транспорта до нашего TURN
 * дотягивается эта сеть. Результат человек копирует в таблицу
 * deploy/coturn/README.md. Это служебный экран команды, не продукт.
 */
export function CallsProbeView() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [turnConfigured, setTurnConfigured] = useState<boolean | null>(null);
  const [plan, setPlan] = useState<ProbeStep[]>([]);
  const [results, setResults] = useState<StepResult[]>([]);
  const [loopback, setLoopback] = useState<StepOutcome>("pending");

  const run = useCallback(async () => {
    setPhase("loading");
    setError(null);
    setResults([]);
    setLoopback("pending");
    try {
      const res = await apiFetch(`${API_URL}/chat/calls/ice-servers`);
      if (!res.ok) throw new Error(`API ответил ${res.status}`);
      const state = (await res.json()) as ChatIceServersState;
      setTurnConfigured(state.turnConfigured);
      const steps = buildProbePlan(state.iceServers);
      setPlan(steps);
      setPhase("running");
      // Последовательно, а не параллельно: четыре одновременных соединения
      // к одному TURN размывают ответ на вопрос «какой транспорт проходит».
      const collected: StepResult[] = [];
      for (const step of steps) {
        const result = await runStep(step);
        collected.push(result);
        setResults([...collected]);
      }
      if (state.turnConfigured) setLoopback(await runLoopback(state.iceServers));
      else setLoopback("fail");
      setPhase("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase("error");
    }
  }, []);

  const summary = formatSummary(results, loopback);
  const busy = phase === "loading" || phase === "running";

  return (
    <section className="space-y-5">
      <p className="text-sm text-text-1">
        Проверяет, доходит ли эта сеть до TURN-сервера портала по UDP, TCP и
        TLS, и проходит ли через него трафик. Запустите с домашнего
        провайдера и с мобильного интернета, строку итога отправьте команде.
      </p>

      <button
        type="button"
        onClick={() => void run()}
        disabled={busy}
        className="rounded-full bg-magenta px-5 py-2 text-sm font-semibold text-white disabled:opacity-60"
      >
        {busy ? "Проверяем…" : "Запустить проверку"}
      </button>

      {turnConfigured === false && (
        <p className="rounded-2xl border border-glass-brd bg-glass px-4 py-3 text-sm text-text-1">
          TURN на сервере не настроен: проверится только STUN. Задайте
          TURN_HOST и TURN_SECRET в env API.
        </p>
      )}

      {error && (
        <p role="alert" className="text-sm text-magenta">
          Не удалось: {error}
        </p>
      )}

      {plan.length > 0 && (
        <div className="overflow-x-auto rounded-2xl border border-glass-brd bg-glass">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-text-2">
                <th className="px-4 py-2 font-medium">Транспорт</th>
                <th className="px-4 py-2 font-medium">Итог</th>
                <th className="px-4 py-2 font-medium font-mono">мс</th>
              </tr>
            </thead>
            <tbody>
              {plan.map((step) => {
                const r = results.find((x) => x.transport === step.transport);
                const outcome: StepOutcome = r?.outcome ?? "pending";
                return (
                  <tr key={step.transport} className="border-t border-glass-brd">
                    <td className="px-4 py-2 text-text-0">{step.label}</td>
                    <td
                      className={
                        outcome === "fail" ? "px-4 py-2 text-magenta" : "px-4 py-2 text-text-0"
                      }
                    >
                      {OUTCOME_LABEL[outcome]}
                    </td>
                    <td className="px-4 py-2 font-mono text-text-1">
                      {r?.ms ?? "—"}
                    </td>
                  </tr>
                );
              })}
              <tr className="border-t border-glass-brd">
                <td className="px-4 py-2 text-text-0">Данные через релей (петля)</td>
                <td
                  className={
                    loopback === "fail" ? "px-4 py-2 text-magenta" : "px-4 py-2 text-text-0"
                  }
                >
                  {OUTCOME_LABEL[loopback]}
                </td>
                <td className="px-4 py-2 font-mono text-text-1">—</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {phase === "done" && (
        <div className="space-y-2">
          <p className="text-xs text-text-2">
            Строка для таблицы в README (STUN | relay UDP | relay TCP | relay
            TLS | петля):
          </p>
          <pre className="overflow-x-auto rounded-xl border border-glass-brd bg-glass px-4 py-3 font-mono text-sm text-text-0">
            {summary}
          </pre>
        </div>
      )}
    </section>
  );
}
