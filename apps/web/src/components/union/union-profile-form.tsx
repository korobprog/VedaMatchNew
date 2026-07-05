"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import type {
  UnionFormat,
  UnionPrivacySettings,
  UnionProfileDto,
  UnionProfileUpdateRequest,
  UnionVisibilityLevel,
} from "@vedamatch/shared";
import {
  IntentionConstructor,
  IntentionWeights,
  intentionSum,
} from "./intention-constructor";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

const formatLabels: Record<UnionFormat, string> = {
  online: "Только онлайн",
  offline: "Только офлайн",
  any: "Онлайн и офлайн",
};

const privacyLabels: Record<UnionVisibilityLevel, string> = {
  everyone: "Видно всем",
  after_match: "После взаимного интереса",
  hidden: "Скрыто",
};

const privacyFields: Array<[keyof UnionPrivacySettings, string]> = [
  ["photo", "Фото"],
  ["age", "Возраст"],
  ["city", "Город"],
  ["contacts", "Контакты"],
];

const listFields = [
  ["languages", "Языки общения", "русский, английский"],
  ["skills", "Навыки", "дизайн, кулинария, организация событий"],
  ["interests", "Интересы", "йога, философия, киртан"],
  ["values", "Ценности", "семья, служение, простота"],
] as const;

type ListFieldKey = (typeof listFields)[number][0];

function toWeights(profile: UnionProfileDto | null): IntentionWeights {
  const weights: IntentionWeights = { family: 0, business: 0, friendship: 0, service: 0 };
  if (!profile) return { family: 40, business: 20, friendship: 20, service: 20 };
  for (const intention of profile.intentions) {
    weights[intention.type] = intention.weight;
  }
  return weights;
}

function toListText(profile: UnionProfileDto | null): Record<ListFieldKey, string> {
  return {
    languages: profile?.languages.join(", ") ?? "",
    skills: profile?.skills.join(", ") ?? "",
    interests: profile?.interests.join(", ") ?? "",
    values: profile?.values.join(", ") ?? "",
  };
}

export function UnionProfileForm({ profile }: { profile: UnionProfileDto | null }) {
  const router = useRouter();
  const [weights, setWeights] = useState<IntentionWeights>(toWeights(profile));
  const [about, setAbout] = useState(profile?.about ?? "");
  const [familyStatus, setFamilyStatus] = useState(profile?.familyStatus ?? "");
  const [format, setFormat] = useState<UnionFormat>(profile?.format ?? "any");
  const [relocationReady, setRelocationReady] = useState(profile?.relocationReady ?? false);
  const [lists, setLists] = useState(toListText(profile));
  const [privacy, setPrivacy] = useState<UnionPrivacySettings>(profile?.privacy ?? {});
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sumOk = intentionSum(weights) === 100;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!sumOk) return;
    setPending(true);
    setMessage(null);
    setError(null);
    try {
      const body: UnionProfileUpdateRequest = {
        about: about.trim() || null,
        familyStatus: familyStatus.trim() || null,
        format,
        relocationReady,
        languages: splitList(lists.languages),
        skills: splitList(lists.skills),
        interests: splitList(lists.interests),
        values: splitList(lists.values),
        privacy,
        intentions: (Object.entries(weights) as Array<[keyof IntentionWeights, number]>)
          .filter(([, weight]) => weight > 0)
          .map(([type, weight]) => ({ type, weight })),
      };
      const res = await fetch(`${API_URL}/union/profile`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await res.text());
      setMessage("Профиль Union сохранён");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось сохранить профиль");
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="space-y-6 rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900"
    >
      <IntentionConstructor weights={weights} onChange={setWeights} />

      <div>
        <label htmlFor="union-about" className="mb-1 block text-sm text-zinc-700 dark:text-zinc-300">
          О себе
        </label>
        <textarea
          id="union-about"
          value={about}
          onChange={(e) => setAbout(e.target.value)}
          rows={4}
          maxLength={2000}
          placeholder="Расскажите о себе, своём пути и что вы ищете"
          className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
        />
      </div>

      {listFields.map(([key, label, placeholder]) => (
        <div key={key}>
          <label htmlFor={`union-${key}`} className="mb-1 block text-sm text-zinc-700 dark:text-zinc-300">
            {label} <span className="text-zinc-400">(через запятую)</span>
          </label>
          <input
            id={`union-${key}`}
            type="text"
            value={lists[key]}
            onChange={(e) => setLists({ ...lists, [key]: e.target.value })}
            placeholder={placeholder}
            className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
          />
        </div>
      ))}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="union-family-status" className="mb-1 block text-sm text-zinc-700 dark:text-zinc-300">
            Семейный статус <span className="text-zinc-400">(по желанию)</span>
          </label>
          <input
            id="union-family-status"
            type="text"
            value={familyStatus}
            onChange={(e) => setFamilyStatus(e.target.value)}
            className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
          />
        </div>
        <div>
          <label htmlFor="union-format" className="mb-1 block text-sm text-zinc-700 dark:text-zinc-300">
            Формат общения
          </label>
          <select
            id="union-format"
            value={format}
            onChange={(e) => setFormat(e.target.value as UnionFormat)}
            className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
          >
            {(Object.keys(formatLabels) as UnionFormat[]).map((value) => (
              <option key={value} value={value}>
                {formatLabels[value]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
        <input
          type="checkbox"
          checked={relocationReady}
          onChange={(e) => setRelocationReady(e.target.checked)}
          className="h-4 w-4 accent-amber-600"
        />
        Готов(а) к переезду
      </label>

      <fieldset>
        <legend className="mb-2 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          Приватность
        </legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {privacyFields.map(([key, label]) => (
            <div key={key}>
              <label htmlFor={`union-privacy-${key}`} className="mb-1 block text-sm text-zinc-700 dark:text-zinc-300">
                {label}
              </label>
              <select
                id={`union-privacy-${key}`}
                value={privacy[key] ?? "everyone"}
                onChange={(e) =>
                  setPrivacy({ ...privacy, [key]: e.target.value as UnionVisibilityLevel })
                }
                className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              >
                {(Object.keys(privacyLabels) as UnionVisibilityLevel[]).map((value) => (
                  <option key={value} value={value}>
                    {privacyLabels[value]}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
      </fieldset>

      {message && <p className="text-sm text-emerald-600">{message}</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={pending || !sumOk}
        className="w-full rounded-xl bg-amber-600 py-3 text-sm font-medium text-white transition hover:bg-amber-700 disabled:cursor-not-allowed disabled:bg-zinc-300 dark:disabled:bg-zinc-700"
      >
        {pending ? "Сохранение..." : "Сохранить профиль Union"}
      </button>
    </form>
  );
}

function splitList(text: string): string[] {
  return text
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}
