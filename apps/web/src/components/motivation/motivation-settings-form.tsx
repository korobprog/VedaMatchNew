"use client";

import { useState } from "react";
import type {
  MotivationLanguage,
  MotivationPreferenceDto,
  MotivationProfileType,
} from "@vedamatch/shared";
import { apiFetch } from "@/lib/http-client";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

const profiles: ReadonlyArray<{
  value: MotivationProfileType;
  label: string;
  hint: string;
}> = [
  { value: "user", label: "Ищущий", hint: "первые шаги, общие вопросы" },
  { value: "in_goodness", label: "В благости", hint: "образ жизни и привычки" },
  { value: "yogi", label: "Йог", hint: "практика и дисциплина ума" },
  { value: "devotee", label: "Преданный", hint: "бхакти и служение" },
];

export function MotivationSettingsForm({
  initial,
}: {
  initial: MotivationPreferenceDto;
}) {
  const [percent, setPercent] = useState(initial.vaishnavaPercent);
  const [language, setLanguage] = useState<MotivationLanguage>(initial.language);
  const [selected, setSelected] = useState<MotivationProfileType[]>(
    initial.profileTypes ?? [],
  );
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");

  function toggle(profile: MotivationProfileType) {
    setState("idle");
    setSelected((current) =>
      current.includes(profile)
        ? current.filter((item) => item !== profile)
        : [...current, profile],
    );
  }

  async function save() {
    setState("saving");
    try {
      const response = await apiFetch(`${API_URL}/motivation/preferences`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          vaishnavaPercent: percent,
          language,
          profileTypes: selected,
        }),
      });
      if (!response.ok) throw new Error(await response.text());
      setState("saved");
    } catch {
      setState("error");
    }
  }

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
      <fieldset>
        <legend className="font-medium text-zinc-900 dark:text-zinc-100">
          Что показывать в ленте
        </legend>
        <p className="mt-1 text-sm text-zinc-500">
          {selected.length === 0
            ? "Сейчас лента подбирается по вашей самоидентификации. Отметьте, чтобы выбрать вручную."
            : "Отмеченные направления попадут в ленту."}
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {profiles.map((profile) => {
            const active = selected.includes(profile.value);
            return (
              <label
                key={profile.value}
                className={[
                  "flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors",
                  active
                    ? "border-amber-500 bg-amber-50 dark:bg-amber-950/40"
                    : "border-zinc-200 hover:border-zinc-300 dark:border-zinc-700",
                ].join(" ")}
              >
                <input
                  type="checkbox"
                  checked={active}
                  onChange={() => toggle(profile.value)}
                  className="mt-0.5 h-5 w-5 shrink-0 accent-amber-600"
                />
                <span>
                  <span className="block text-sm font-medium text-zinc-900 dark:text-zinc-100">
                    {profile.label}
                  </span>
                  <span className="block text-xs text-zinc-500">{profile.hint}</span>
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <label className="mt-6 block font-medium text-zinc-900 dark:text-zinc-100">
        Доля вайшнавских публикаций: {percent}%
        <input
          aria-label="Доля вайшнавских публикаций"
          type="range"
          min="0"
          max="100"
          step="10"
          value={percent}
          onChange={(event) => setPercent(Number(event.target.value))}
          className="mt-4 w-full accent-amber-600"
        />
      </label>
      <div className="mt-2 flex justify-between text-xs text-zinc-500">
        <span>Только универсальные</span>
        <span>Только вайшнавские</span>
      </div>

      <label className="mt-6 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
        Язык
        <select
          value={language}
          onChange={(event) => setLanguage(event.target.value as MotivationLanguage)}
          className="mt-2 w-full rounded-xl border border-zinc-300 bg-white px-3 py-3 text-base dark:border-zinc-700 dark:bg-zinc-950"
        >
          <option value="ru">Русский</option>
          <option value="en">English</option>
          <option value="hi">हिन्दी</option>
        </select>
      </label>

      {state === "error" && (
        <p role="alert" className="mt-4 text-sm text-red-600">
          Не удалось сохранить настройки.
        </p>
      )}
      {state === "saved" && (
        <p role="status" className="mt-4 text-sm text-green-600">
          Настройки сохранены.
        </p>
      )}
      <button
        type="button"
        onClick={save}
        disabled={state === "saving"}
        className="mt-6 min-h-11 w-full rounded-xl bg-amber-600 px-4 py-3 text-sm font-medium text-white hover:bg-amber-700 disabled:bg-zinc-400"
      >
        {state === "saving" ? "Сохраняем..." : "Сохранить"}
      </button>
    </div>
  );
}
