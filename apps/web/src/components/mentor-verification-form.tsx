"use client";

import { useState } from "react";
import type { MentorVerificationPublicRequest, MentorVerificationSubmit } from "@vedamatch/shared";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

const initialForm: MentorVerificationSubmit = {
  mentorName: "",
  phone: "",
  email: "",
  cityOrCommunity: "",
  knownDuration: "",
  knowsPersonally: true,
  confirmsRegularPractice: true,
  confirmsService: false,
  confirmsSpiritualName: false,
  confirmsCommunityConnection: true,
  userCharacterReference: "",
  recommendsDevoteeStatus: true,
  truthConsent: false,
};

export function MentorVerificationForm({
  token,
  request,
}: {
  token: string;
  request: MentorVerificationPublicRequest;
}) {
  const [form, setForm] = useState(initialForm);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(Boolean(request.submittedAt));
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/mentor-verifications/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error(await res.text());
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось отправить форму");
    } finally {
      setPending(false);
    }
  }

  if (done) {
    return (
      <div className="rounded-2xl border border-green-200 bg-green-50 p-6 text-green-900 dark:border-green-900 dark:bg-green-950 dark:text-green-100">
        Спасибо! Форма наставника сохранена. Заявка передана администратору на проверку.
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <p className="mb-6 text-sm text-zinc-600 dark:text-zinc-400">
        Пользователь <strong>{request.userName}</strong> просит подтвердить статус “Преданный”. Регистрация наставника на портале не требуется.
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <TextInput label="Имя наставника" value={form.mentorName} onChange={(mentorName) => setForm({ ...form, mentorName })} />
        <TextInput label="Телефон" value={form.phone} onChange={(phone) => setForm({ ...form, phone })} />
        <TextInput label="Email" value={form.email} onChange={(email) => setForm({ ...form, email })} />
        <TextInput label="Город / община" value={form.cityOrCommunity} onChange={(cityOrCommunity) => setForm({ ...form, cityOrCommunity })} />
        <TextInput label="Как давно знаете пользователя" value={form.knownDuration} onChange={(knownDuration) => setForm({ ...form, knownDuration })} />
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <Checkbox label="Знаю пользователя лично" checked={form.knowsPersonally} onChange={(knowsPersonally) => setForm({ ...form, knowsPersonally })} />
        <Checkbox label="Есть регулярная практика" checked={form.confirmsRegularPractice} onChange={(confirmsRegularPractice) => setForm({ ...form, confirmsRegularPractice })} />
        <Checkbox label="Есть служение" checked={form.confirmsService} onChange={(confirmsService) => setForm({ ...form, confirmsService })} />
        <Checkbox label="Есть духовное имя" checked={form.confirmsSpiritualName} onChange={(confirmsSpiritualName) => setForm({ ...form, confirmsSpiritualName })} />
        <Checkbox label="Есть связь с общиной" checked={form.confirmsCommunityConnection} onChange={(confirmsCommunityConnection) => setForm({ ...form, confirmsCommunityConnection })} />
        <Checkbox label="Рекомендую подтвердить статус" checked={form.recommendsDevoteeStatus} onChange={(recommendsDevoteeStatus) => setForm({ ...form, recommendsDevoteeStatus })} />
      </div>

      <label className="mt-5 block">
        <span className="mb-2 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Характеристика пользователя
        </span>
        <textarea
          value={form.userCharacterReference}
          onChange={(event) => setForm({ ...form, userCharacterReference: event.target.value })}
          rows={5}
          className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-3 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
        />
      </label>

      <div className="mt-5">
        <Checkbox
          label="Подтверждаю достоверность предоставленных данных"
          checked={form.truthConsent}
          onChange={(truthConsent) => setForm({ ...form, truthConsent })}
        />
      </div>

      {error && (
        <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-200">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={submit}
        disabled={pending || !form.truthConsent}
        className="mt-6 w-full rounded-xl bg-amber-600 px-4 py-3 text-sm font-medium text-white transition hover:bg-amber-700 disabled:cursor-not-allowed disabled:bg-zinc-400"
      >
        {pending ? "Отправляем..." : "Отправить подтверждение"}
      </button>
    </div>
  );
}

function TextInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-medium text-zinc-700 dark:text-zinc-300">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-3 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
      />
    </label>
  );
}

function Checkbox({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="flex items-center gap-3 rounded-xl border border-zinc-200 p-3 text-sm text-zinc-700 dark:border-zinc-700 dark:text-zinc-300">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-4 w-4 accent-amber-600"
      />
      {label}
    </label>
  );
}
