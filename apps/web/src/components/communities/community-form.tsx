"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import type {
  CommunityJoinPolicy,
  CommunityKind,
  GeoSearchResult,
  ProfileLocation,
} from "@vedamatch/shared";
import { CommunitiesApiError, createCommunity } from "@/lib/communities-api";
import {
  COMMUNITY_KIND_LABELS,
  COMMUNITY_KIND_ORDER,
  JOIN_POLICY_LABELS,
} from "./community-labels";
import { apiFetch } from "@/lib/http-client";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

const JOIN_POLICIES: CommunityJoinPolicy[] = [
  "request_approval",
  "open",
  "invite_only",
];

/** Заведение общины. Карточка уходит на проверку администрации портала. */
export function CommunityForm() {
  const router = useRouter();
  const [kind, setKind] = useState<CommunityKind>("yatra");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [address, setAddress] = useState("");
  const [joinPolicy, setJoinPolicy] =
    useState<CommunityJoinPolicy>("request_approval");
  const [location, setLocation] = useState<ProfileLocation | null>(null);
  const [locationQuery, setLocationQuery] = useState("");
  const [locationResults, setLocationResults] = useState<GeoSearchResult[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const query = locationQuery.trim();
    const controller = new AbortController();
    // Сброс подсказок живёт внутри таймера, а не в теле эффекта: setState
    // синхронно в эффекте вызывает каскад перерисовок.
    const timeout = window.setTimeout(() => {
      if (query.length < 2 || query === location?.displayName) {
        setLocationResults([]);
        return;
      }
      apiFetch(`${API_URL}/geo/search?q=${encodeURIComponent(query)}`, {
        signal: controller.signal,
      })
        .then(async (res) => {
          if (!res.ok) throw new Error(await res.text());
          setLocationResults((await res.json()) as GeoSearchResult[]);
        })
        .catch((e: unknown) => {
          if (e instanceof DOMException && e.name === "AbortError") return;
          setLocationResults([]);
        });
    }, 350);
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [location?.displayName, locationQuery]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const community = await createCommunity({
        kind,
        name,
        descriptionRu: description || null,
        address: address || null,
        location,
        joinPolicy,
      });
      router.push(`/communities/${community.slug}`);
    } catch (e) {
      setError(
        e instanceof CommunitiesApiError ? e.message : "Не удалось сохранить",
      );
      setPending(false);
    }
  };

  return (
    <form onSubmit={submit} className="glass rounded-2xl border border-glass-brd p-6">
      <p className="mb-6 rounded-xl border border-glass-brd bg-glass px-4 py-3 text-sm text-text-1">
        Карточку увидит администрация портала и подтвердит её. Так справочник не
        зарастает дублями одной и той же ятры под разными названиями.
      </p>

      <label className="mb-2 block text-sm font-medium text-text-1">Тип</label>
      <div className="mb-5 flex flex-wrap gap-2">
        {COMMUNITY_KIND_ORDER.map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={kind === option}
            onClick={() => setKind(option)}
            className={`rounded-full border px-3 py-1 text-sm transition ${
              kind === option
                ? "border-magenta/40 bg-magenta/10 text-text-0"
                : "border-glass-brd text-text-1 hover:text-text-0"
            }`}
          >
            {COMMUNITY_KIND_LABELS[option]}
          </button>
        ))}
      </div>

      <Field label="Название">
        <input
          required
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Московская ятра"
          className="w-full rounded-xl border border-glass-brd bg-transparent px-3 py-2 text-sm text-text-0 placeholder:text-text-2"
        />
      </Field>

      <Field label="Описание">
        <textarea
          rows={4}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="Чем живёт община, когда программы, кого ждёте"
          className="w-full rounded-xl border border-glass-brd bg-transparent px-3 py-2 text-sm text-text-0 placeholder:text-text-2"
        />
      </Field>

      <Field label="Город">
        <input
          value={location ? (location.displayName ?? location.city) : locationQuery}
          onChange={(event) => {
            setLocation(null);
            setLocationQuery(event.target.value);
          }}
          placeholder="Начните вводить город"
          className="w-full rounded-xl border border-glass-brd bg-transparent px-3 py-2 text-sm text-text-0 placeholder:text-text-2"
        />
        {locationResults.length > 0 && (
          <ul className="mt-2 space-y-1">
            {locationResults.map((result) => (
              <li key={`${result.lat},${result.lon}`}>
                <button
                  type="button"
                  onClick={() => {
                    setLocation(result);
                    setLocationQuery(result.displayName ?? result.city);
                    setLocationResults([]);
                  }}
                  className="w-full rounded-lg border border-glass-brd px-3 py-2 text-left text-sm text-text-1 hover:text-text-0"
                >
                  {result.displayName ?? result.city}
                </button>
              </li>
            ))}
          </ul>
        )}
      </Field>

      <Field label="Адрес (необязательно)">
        <input
          value={address}
          onChange={(event) => setAddress(event.target.value)}
          placeholder="Улица, дом — если у общины есть постоянное место"
          className="w-full rounded-xl border border-glass-brd bg-transparent px-3 py-2 text-sm text-text-0 placeholder:text-text-2"
        />
        <p className="mt-1 text-xs text-text-2">
          Адрес общины публичный. Домашние адреса участников на карте не
          показываются никогда.
        </p>
      </Field>

      <label className="mb-2 block text-sm font-medium text-text-1">
        Как вступают
      </label>
      <div className="mb-6 flex flex-wrap gap-2">
        {JOIN_POLICIES.map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={joinPolicy === option}
            onClick={() => setJoinPolicy(option)}
            className={`rounded-full border px-3 py-1 text-sm transition ${
              joinPolicy === option
                ? "border-magenta/40 bg-magenta/10 text-text-0"
                : "border-glass-brd text-text-1 hover:text-text-0"
            }`}
          >
            {JOIN_POLICY_LABELS[option]}
          </button>
        ))}
      </div>

      {error && (
        <p className="mb-4 rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-400">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending || !name.trim()}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-magenta to-[#B23EFF] px-4 py-3 text-sm font-medium text-white transition disabled:opacity-50"
      >
        {pending && <Loader2 className="size-4 animate-spin" />}
        Отправить на проверку
      </button>
    </form>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-5">
      <label className="mb-2 block text-sm font-medium text-text-1">
        {label}
      </label>
      {children}
    </div>
  );
}
