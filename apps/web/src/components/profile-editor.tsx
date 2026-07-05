"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type {
  GeoSearchResult,
  ProfileLocation,
  ProfileMessengers,
  ProfileSocialLinks,
  UserProfile,
} from "@vedamatch/shared";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const MAX_AVATAR_SIZE = 5 * 1024 * 1024;

const socialFields: Array<[keyof ProfileSocialLinks, string, string]> = [
  ["instagram", "Instagram", "username или ссылка"],
  ["telegram", "Telegram", "@username или https://t.me/..."],
  ["x", "X / Twitter", "username или ссылка"],
  ["facebook", "Facebook", "ссылка на профиль"],
  ["linkedin", "LinkedIn", "ссылка на профиль"],
  ["vk", "ВКонтакте", "username или ссылка"],
  ["tiktok", "TikTok", "username или ссылка"],
  ["youtube", "YouTube", "ссылка на канал"],
  ["website", "Личный сайт", "https://..."],
];

const messengerFields: Array<
  [keyof ProfileMessengers, string, string, "text" | "tel"]
> = [
  ["telegram", "Telegram", "@username или https://t.me/...", "text"],
  ["whatsapp", "WhatsApp", "+79990000000 или https://wa.me/...", "text"],
  ["mx", "MAX", "+79990000000", "tel"],
  ["phone", "Телефон", "+79990000000", "tel"],
];

export function ProfileEditor({ user }: { user: UserProfile }) {
  const router = useRouter();
  const [profile, setProfile] = useState(user);
  const [socialLinks, setSocialLinks] = useState<ProfileSocialLinks>(
    user.socialLinks ?? {},
  );
  const [messengers, setMessengers] = useState<ProfileMessengers>(
    user.messengers ?? {},
  );
  const [homeLocation, setHomeLocation] = useState<ProfileLocation | null>(
    user.homeLocation ?? null,
  );
  const [locationQuery, setLocationQuery] = useState(
    user.homeLocation?.displayName ?? user.homeLocation?.city ?? "",
  );
  const [locationResults, setLocationResults] = useState<GeoSearchResult[]>([]);
  const [locationPending, setLocationPending] = useState(false);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [pending, setPending] = useState(false);
  const [avatarPending, setAvatarPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const avatarPreview = useMemo(
    () => (avatarFile ? URL.createObjectURL(avatarFile) : null),
    [avatarFile],
  );

  useEffect(() => {
    if (!avatarPreview) return;
    return () => URL.revokeObjectURL(avatarPreview);
  }, [avatarPreview]);

  useEffect(() => {
    const query = locationQuery.trim();
    if (query.length < 2 || query === homeLocation?.displayName) {
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setLocationPending(true);
      try {
        const res = await fetch(
          `${API_URL}/geo/search?q=${encodeURIComponent(query)}`,
          { signal: controller.signal },
        );
        if (!res.ok) throw new Error(await res.text());
        setLocationResults((await res.json()) as GeoSearchResult[]);
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return;
        setLocationResults([]);
      } finally {
        setLocationPending(false);
      }
    }, 350);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [homeLocation?.displayName, locationQuery]);

  const mapUrl = useMemo(() => {
    if (!homeLocation) return null;
    const lat = homeLocation.lat;
    const lon = homeLocation.lon;
    const bbox = [lon - 0.08, lat - 0.04, lon + 0.08, lat + 0.04].join(",");
    const params = new URLSearchParams({
      bbox,
      layer: "mapnik",
      marker: `${lat},${lon}`,
    });
    return `https://www.openstreetmap.org/export/embed.html?${params.toString()}`;
  }, [homeLocation]);

  function selectAvatar(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    setError(null);
    setMessage(null);
    if (!file) {
      setAvatarFile(null);
      return;
    }
    if (!Object.keys({ "image/jpeg": true, "image/png": true, "image/webp": true }).includes(file.type)) {
      setError("Разрешены только jpg, jpeg, png и webp");
      event.target.value = "";
      return;
    }
    if (file.size > MAX_AVATAR_SIZE) {
      setError("Размер аватара не должен превышать 5 MB");
      event.target.value = "";
      return;
    }
    setAvatarFile(file);
  }

  async function uploadAvatar() {
    if (!avatarFile) return;
    setAvatarPending(true);
    setError(null);
    setMessage(null);
    try {
      const formData = new FormData();
      formData.append("file", avatarFile);
      const res = await fetch(`${API_URL}/profile/avatar`, {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      if (!res.ok) throw new Error(await res.text());
      const updated = (await res.json()) as UserProfile;
      setProfile(updated);
      setAvatarFile(null);
      setMessage("Аватар сохранён");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось загрузить аватар");
    } finally {
      setAvatarPending(false);
    }
  }

  async function deleteAvatar() {
    setAvatarPending(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`${API_URL}/profile/avatar`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      const updated = (await res.json()) as UserProfile;
      setProfile(updated);
      setAvatarFile(null);
      setMessage("Аватар удалён");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось удалить аватар");
    } finally {
      setAvatarPending(false);
    }
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`${API_URL}/profile`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ homeLocation, socialLinks, messengers }),
      });
      if (!res.ok) throw new Error(await res.text());
      const updated = (await res.json()) as UserProfile;
      setProfile(updated);
      setHomeLocation(updated.homeLocation);
      setSocialLinks(updated.socialLinks ?? {});
      setMessengers(updated.messengers ?? {});
      setMessage("Профиль сохранён");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось сохранить профиль");
    } finally {
      setPending(false);
    }
  }

  async function detectLocation() {
    if (!navigator.geolocation) {
      setError("Браузер не поддерживает определение местоположения");
      return;
    }
    setError(null);
    setMessage(null);
    setLocationPending(true);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const { latitude, longitude } = position.coords;
          const res = await fetch(
            `${API_URL}/geo/reverse?lat=${latitude}&lon=${longitude}`,
          );
          if (!res.ok) throw new Error(await res.text());
          const location = (await res.json()) as GeoSearchResult;
          setHomeLocation(location);
          setLocationQuery(location.displayName ?? location.city);
          setLocationResults([]);
        } catch (e) {
          setError(e instanceof Error ? e.message : "Не удалось определить город");
        } finally {
          setLocationPending(false);
        }
      },
      () => {
        setLocationPending(false);
        setError("Разрешение на геолокацию не получено");
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 },
    );
  }

  const avatarSrc = avatarPreview ?? profile.avatarUrl;

  return (
    <form onSubmit={saveProfile} className="mt-6 space-y-6">
      <section className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="mb-4 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          Аватар
        </h2>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          {avatarSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={avatarSrc}
              alt={profile.name}
              className="h-24 w-24 rounded-full object-cover"
              referrerPolicy="no-referrer"
            />
          ) : (
            <span className="flex h-24 w-24 items-center justify-center rounded-full bg-amber-100 text-3xl font-semibold text-amber-800 dark:bg-amber-900 dark:text-amber-200">
              {profile.name.charAt(0).toUpperCase()}
            </span>
          )}
          <div className="flex-1 space-y-3">
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={selectAvatar}
              className="block w-full text-sm text-zinc-600 file:mr-4 file:rounded-lg file:border-0 file:bg-zinc-900 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white dark:text-zinc-300 dark:file:bg-zinc-100 dark:file:text-zinc-900"
            />
            <p className="text-xs text-zinc-500">JPG, PNG или WebP до 5 MB. Перед сохранением показывается preview.</p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={uploadAvatar}
                disabled={!avatarFile || avatarPending}
                className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:cursor-not-allowed disabled:bg-zinc-400"
              >
                {avatarPending ? "Сохраняем..." : "Сохранить аватар"}
              </button>
              <button
                type="button"
                onClick={deleteAvatar}
                disabled={!profile.avatarUrl || avatarPending}
                className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:text-zinc-400 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
              >
                Удалить
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="mb-2 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          Город проживания
        </h2>
        <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-400">
          Геолокация не запрашивается автоматически. Выберите город поиском или нажмите кнопку ниже.
        </p>
        <div className="relative">
          <input
            type="text"
            value={locationQuery}
            onChange={(event) => {
              setLocationQuery(event.target.value);
              setLocationResults([]);
            }}
            placeholder="Начните вводить город"
            className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-3 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
          />
          {locationResults.length > 0 && (
            <div className="absolute z-10 mt-2 max-h-72 w-full overflow-auto rounded-xl border border-zinc-200 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
              {locationResults.map((item) => (
                <button
                  key={`${item.lat}-${item.lon}-${item.displayName}`}
                  type="button"
                  onClick={() => {
                    setHomeLocation(item);
                    setLocationQuery(item.displayName ?? item.city);
                    setLocationResults([]);
                  }}
                  className="block w-full px-4 py-3 text-left text-sm hover:bg-amber-50 dark:hover:bg-zinc-800"
                >
                  <span className="block font-medium text-zinc-900 dark:text-zinc-100">
                    {item.city}{item.country ? `, ${item.country}` : ""}
                  </span>
                  {item.displayName && (
                    <span className="block text-xs text-zinc-500">{item.displayName}</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={detectLocation}
            disabled={locationPending}
            className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:text-zinc-400 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            {locationPending ? "Ищем..." : "Определить моё местоположение"}
          </button>
          <button
            type="button"
            onClick={() => {
              setHomeLocation(null);
              setLocationQuery("");
              setLocationResults([]);
            }}
            className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            Очистить город
          </button>
        </div>
        {homeLocation && (
          <div className="mt-4 overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-700">
            <div className="bg-zinc-50 p-3 text-sm text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
              Выбран город: <span className="font-medium">{homeLocation.city}</span>
              {homeLocation.country ? `, ${homeLocation.country}` : ""}
            </div>
            {mapUrl && (
              <iframe
                title="Карта города проживания"
                src={mapUrl}
                className="h-72 w-full border-0"
                loading="lazy"
              />
            )}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="mb-4 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          Социальные сети
        </h2>
        <div className="grid gap-4 md:grid-cols-2">
          {socialFields.map(([key, label, placeholder]) => (
            <TextField
              key={key}
              label={label}
              placeholder={placeholder}
              value={socialLinks[key] ?? ""}
              onChange={(value) => setSocialLinks({ ...socialLinks, [key]: value })}
            />
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="mb-4 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          Мессенджеры и контакты
        </h2>
        <div className="grid gap-4 md:grid-cols-2">
          {messengerFields.map(([key, label, placeholder, type]) => (
            <TextField
              key={key}
              label={label}
              placeholder={placeholder}
              type={type}
              value={messengers[key] ?? ""}
              onChange={(value) => setMessengers({ ...messengers, [key]: value })}
            />
          ))}
        </div>
      </section>

      {error && (
        <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-200">
          {error}
        </p>
      )}
      {message && (
        <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700 dark:bg-emerald-950 dark:text-emerald-200">
          {message}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-xl bg-amber-600 px-4 py-3 text-sm font-medium text-white transition hover:bg-amber-700 disabled:cursor-not-allowed disabled:bg-zinc-400"
      >
        {pending ? "Сохраняем..." : "Сохранить изменения профиля"}
      </button>
    </form>
  );
}

function TextField({
  label,
  placeholder,
  type = "text",
  value,
  onChange,
}: {
  label: string;
  placeholder: string;
  type?: "text" | "tel";
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
        {label}
      </span>
      <input
        type={type}
        inputMode={type === "tel" ? "tel" : undefined}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-3 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
      />
    </label>
  );
}
