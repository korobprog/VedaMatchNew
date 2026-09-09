"use client";

import { useState } from "react";
import type {
  AdminChatCallsState,
  ChatCallDto,
  ChatCallKind,
  UpdateChatCallSettingsRequest,
} from "@vedamatch/shared";
import { Alert } from "@/components/ui/alert";
import { API_URL, apiFetch } from "@/lib/http-client";
import {
  callDurationLabel,
  callReasonLabel,
  callStatusLabel,
  formatSeconds,
  percentLabel,
} from "./call-labels";

const KIND_LABELS: Record<ChatCallKind, string> = {
  audio: "Аудио",
  video: "Видео",
};

const dateFormat = new Intl.DateTimeFormat("ru-RU", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

/**
 * Раздел админки «Звонки»: тумблер сервиса, сводка за период и журнал.
 * Тумблер шлёт настройку и целиком подменяет состояние ответом — сервер
 * заодно пересчитывает сводку, и вторая загрузка не нужна.
 */
export function AdminCallsView({ initial }: { initial: AdminChatCallsState | null }) {
  const [state, setState] = useState<AdminChatCallsState | null>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function setCallsEnabled(callsEnabled: boolean) {
    setBusy(true);
    setError(null);
    try {
      const body: UpdateChatCallSettingsRequest = { callsEnabled };
      const res = await apiFetch(`${API_URL}/admin/chat/calls/settings`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await res.text());
      setState((await res.json()) as AdminChatCallsState);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Настройка не сохранилась");
    } finally {
      setBusy(false);
    }
  }

  if (!state) {
    return <Alert tone="error">Не удалось загрузить раздел звонков.</Alert>;
  }

  const { stats, calls } = state;
  const count = (status: keyof typeof stats.byStatus) => stats.byStatus[status] ?? 0;

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-2xl border border-glass-brd bg-glass p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-base font-semibold text-text-0">
              Звонки включены
            </h2>
            <p className="text-sm text-text-1">
              Выключенный тумблер прячет кнопки звонка у всех и обрывает новые
              вызовы; идущие разговоры не трогает.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={state.callsEnabled}
            aria-label="Звонки включены"
            disabled={busy}
            onClick={() => void setCallsEnabled(!state.callsEnabled)}
            className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition-colors disabled:opacity-60 ${
              state.callsEnabled
                ? "border-cyan/60 bg-cyan/30"
                : "border-glass-brd bg-bg-1"
            }`}
          >
            <span
              aria-hidden="true"
              className={`inline-block size-5 rounded-full bg-text-0 transition-transform ${
                state.callsEnabled ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
        </div>
        {!state.turnConfigured && (
          <Alert tone="info" className="mt-3">
            TURN не настроен — звонки пойдут только напрямую (STUN)
          </Alert>
        )}
        {error && (
          <Alert tone="error" className="mt-3">
            {error}
          </Alert>
        )}
      </section>

      <section>
        <h2 className="mb-2 font-display text-base font-semibold text-text-0">
          За {stats.sinceDays} дн.
        </h2>
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Всего" value={String(stats.total)} />
          <Stat label="Состоялись" value={String(count("ended"))} />
          <Stat label="Пропущены" value={String(count("missed"))} />
          <Stat label="Отклонены" value={String(count("declined"))} />
          <Stat label="Отменены" value={String(count("cancelled"))} />
          <Stat label="Оборвались" value={String(count("failed"))} />
          <Stat label="Доля через релей" value={percentLabel(stats.relayedShare)} />
          <Stat label="Суммарно разговоров" value={formatSeconds(stats.talkSeconds)} />
        </dl>
      </section>

      <section>
        <h2 className="mb-2 font-display text-base font-semibold text-text-0">
          Последние звонки
        </h2>
        {calls.length === 0 ? (
          <p className="text-sm text-text-1">Звонков ещё не было</p>
        ) : (
          // Таблица прокручивается внутри себя: на телефоне страница не должна
          // ехать вбок целиком.
          <div className="overflow-x-auto rounded-2xl border border-glass-brd bg-glass">
            <table className="w-full min-w-[52rem] border-collapse text-sm">
              <thead>
                <tr className="border-b border-glass-brd text-left text-text-1">
                  <th scope="col" className="px-3 py-2 font-medium">Время</th>
                  <th scope="col" className="px-3 py-2 font-medium">Кто → кому</th>
                  <th scope="col" className="px-3 py-2 font-medium">Вид</th>
                  <th scope="col" className="px-3 py-2 font-medium">Статус</th>
                  <th scope="col" className="px-3 py-2 font-medium">Длительность</th>
                  <th scope="col" className="px-3 py-2 font-medium">Причина</th>
                </tr>
              </thead>
              <tbody>
                {calls.map((call) => (
                  <CallRow key={call.id} call={call} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function CallRow({ call }: { call: ChatCallDto }) {
  return (
    <tr className="border-b border-glass-brd last:border-b-0">
      <td className="px-3 py-2 font-mono text-text-1">
        {dateFormat.format(new Date(call.createdAt))}
      </td>
      <td className="px-3 py-2 text-text-0">
        {call.caller.name} → {call.callee.name}
      </td>
      <td className="px-3 py-2 text-text-0">{KIND_LABELS[call.kind]}</td>
      <td className="px-3 py-2 text-text-0">{callStatusLabel(call.status)}</td>
      <td className="px-3 py-2 font-mono text-text-0">
        {callDurationLabel(call.answeredAt, call.endedAt)}
      </td>
      <td className="px-3 py-2 text-text-1">{callReasonLabel(call.endReason)}</td>
    </tr>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-glass-brd bg-glass p-3">
      <dt className="text-xs text-text-2">{label}</dt>
      <dd className="font-mono text-xl text-text-0">{value}</dd>
    </div>
  );
}
