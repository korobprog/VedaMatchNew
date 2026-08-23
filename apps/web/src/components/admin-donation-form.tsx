"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import {
  DONATION_REQUISITE_KINDS,
  type DonationRequisite,
  type DonationRequisiteKind,
  type DonationSettingsDto,
} from "@vedamatch/shared";
import { apiFetch } from "@/lib/http-client";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

const kindLabels: Record<DonationRequisiteKind, string> = {
  sbp: "СБП",
  card: "Карта",
  crypto: "Крипто",
  link: "Ссылка",
  other: "Другое",
};

const MAX_REQUISITES = 8;

/**
 * Реквизиты пожертвований (бета). Кнопка «поддержать» в сервисах появляется,
 * только когда включено и есть хотя бы одна заполненная строка.
 */
export function AdminDonationForm({ initial }: { initial: DonationSettingsDto }) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(initial.enabled);
  const [text, setText] = useState(initial.text);
  const [rows, setRows] = useState<DonationRequisite[]>(initial.requisites);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function updateRow(index: number, patch: Partial<DonationRequisite>) {
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSaved(false);
    setPending(true);
    try {
      const res = await apiFetch(`${API_URL}/admin/billing/donation`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled, text, requisites: rows }),
      });
      if (!res.ok) throw new Error(await readError(res));
      setSaved(true);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось сохранить реквизиты");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-2xl border border-gold/40 bg-gold/5 p-4">
      <div>
        <h3 className="font-semibold text-text-0">Пожертвования на развитие</h3>
        <p className="mt-1 text-sm text-text-2">
          Кнопка «Поддержать развитие VedaMatch» и шторка с реквизитами в сервисах. Это не платёж внутри
          приложения: человек копирует реквизит и переводит сам. Без реквизитов кнопка не показывается.
        </p>
      </div>
      {error && (
        <p role="alert" className="rounded-xl bg-red-100 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-200">
          {error}
        </p>
      )}
      <label className="flex items-center gap-2 text-sm text-text-1">
        <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
        Показывать кнопку в сервисах
      </label>
      <label className="block text-sm text-text-1">
        Текст обращения
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={600}
          rows={3}
          placeholder="Генерация видео стоит реальных денег. Пожертвование идёт на развитие портала. Спасибо 🙏"
          className="mt-1 w-full rounded-xl border border-glass-brd bg-bg-0 px-3 py-2 text-sm text-text-0"
        />
      </label>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-text-1">Реквизиты</legend>
        {rows.length === 0 && <p className="text-sm text-text-2">Пока ни одного — добавьте строку.</p>}
        {rows.map((row, index) => (
          <div
            key={index}
            className="grid grid-cols-[minmax(0,7rem)_minmax(0,1fr)_auto] items-start gap-2 rounded-xl border border-glass-brd/60 p-2"
          >
            <select
              aria-label={`Вид реквизита ${index + 1}`}
              value={row.kind}
              onChange={(e) => updateRow(index, { kind: e.target.value as DonationRequisiteKind })}
              className="min-w-0 rounded-xl border border-glass-brd bg-bg-0 px-2 py-2 text-sm text-text-0"
            >
              {DONATION_REQUISITE_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {kindLabels[kind]}
                </option>
              ))}
            </select>
            <input
              aria-label={`Подпись реквизита ${index + 1}`}
              value={row.label}
              onChange={(e) => updateRow(index, { label: e.target.value })}
              placeholder="Подпись: Перевод по СБП"
              maxLength={60}
              className="min-w-0 rounded-xl border border-glass-brd bg-bg-0 px-3 py-2 text-sm text-text-0"
            />
            <input
              aria-label={`Значение реквизита ${index + 1}`}
              value={row.value}
              onChange={(e) => updateRow(index, { value: e.target.value })}
              placeholder={row.kind === "link" ? "https://…" : "Номер, адрес или телефон"}
              maxLength={200}
              className="col-span-2 col-start-1 row-start-2 min-w-0 rounded-xl border border-glass-brd bg-bg-0 px-3 py-2 font-mono text-sm text-text-0"
            />
            <button
              type="button"
              aria-label={`Удалить реквизит ${index + 1}`}
              onClick={() => setRows((current) => current.filter((_, i) => i !== index))}
              className="col-start-3 row-span-2 row-start-1 self-center rounded-xl border border-glass-brd px-3 py-2 text-sm text-text-1 hover:bg-bg-2"
            >
              ✕
            </button>
          </div>
        ))}
        {rows.length < MAX_REQUISITES && (
          <button
            type="button"
            onClick={() => setRows((current) => [...current, { kind: "sbp", label: "", value: "" }])}
            className="btn-mint-outline rounded-xl px-3 py-1.5 text-sm font-medium"
          >
            + Добавить реквизит
          </button>
        )}
      </fieldset>
      <div className="flex items-center gap-3">
        <button disabled={pending} className="btn-mint rounded-xl px-4 py-2 text-sm font-medium disabled:opacity-50">
          {pending ? "Сохраняем…" : "Сохранить реквизиты"}
        </button>
        {saved && <span className="text-sm text-cyan">Сохранено</span>}
      </div>
    </form>
  );
}

async function readError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { message?: string | string[] };
    const message = Array.isArray(body.message) ? body.message.join(", ") : body.message;
    return message || `Ошибка ${res.status}`;
  } catch {
    return `Ошибка ${res.status}`;
  }
}
