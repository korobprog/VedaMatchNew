"use client";

import { useState } from "react";
import type { MotivationLanguage, MotivationPreferenceDto } from "@vedamatch/shared";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export function MotivationSettingsForm({ initial }: { initial: MotivationPreferenceDto }) {
  const [percent, setPercent] = useState(initial.vaishnavaPercent);
  const [language, setLanguage] = useState<MotivationLanguage>(initial.language);
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");

  async function save() {
    setState("saving");
    try {
      const response = await fetch(`${API_URL}/motivation/preferences`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ vaishnavaPercent: percent, language }),
      });
      if (!response.ok) throw new Error(await response.text());
      setState("saved");
    } catch {
      setState("error");
    }
  }

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
      <label className="block font-medium text-zinc-900 dark:text-zinc-100">
        Доля вайшнавских публикаций: {percent}%
        <input aria-label="Доля вайшнавских публикаций" type="range" min="0" max="100" step="10" value={percent} onChange={(event) => setPercent(Number(event.target.value))} className="mt-4 w-full accent-amber-600" />
      </label>
      <div className="mt-2 flex justify-between text-xs text-zinc-500"><span>Только универсальные</span><span>Только вайшнавские</span></div>
      <label className="mt-6 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
        Язык
        <select value={language} onChange={(event) => setLanguage(event.target.value as MotivationLanguage)} className="mt-2 w-full rounded-xl border border-zinc-300 bg-white px-3 py-3 dark:border-zinc-700 dark:bg-zinc-950">
          <option value="ru">Русский</option><option value="en">English</option><option value="hi">हिन्दी</option>
        </select>
      </label>
      {state === "error" && <p className="mt-4 text-sm text-red-600">Не удалось сохранить настройки.</p>}
      {state === "saved" && <p className="mt-4 text-sm text-green-600">Настройки сохранены.</p>}
      <button type="button" onClick={save} disabled={state === "saving"} className="mt-6 w-full rounded-xl bg-amber-600 px-4 py-3 text-sm font-medium text-white hover:bg-amber-700 disabled:bg-zinc-400">{state === "saving" ? "Сохраняем..." : "Сохранить"}</button>
    </div>
  );
}
