"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  NAME_MAX_LENGTH,
  type GeoSearchResult,
  type ProfileLocation,
  type ProfileMessengers,
  type ProfileSocialLinks,
  type UserProfile,
} from "@vedamatch/shared";
import { UserGalleryEditor } from "./user-gallery-editor";
import { PhotoVerificationPanel } from "./photo-verification-panel";
import { apiFetch } from "@/lib/http-client";
import { Alert } from "@/components/ui/alert";
import { Button, buttonClassName } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Input, fieldClassName } from "@/components/ui/input";

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
  const [name, setName] = useState(user.name);
  const [spiritualName, setSpiritualName] = useState(user.spiritualName ?? "");
  const [birthDate, setBirthDate] = useState(user.birthDate ?? "");
  const [gender, setGender] = useState<string>(user.gender ?? "");
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
        const res = await apiFetch(
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
      const res = await apiFetch(`${API_URL}/profile/avatar`, {
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
      const res = await apiFetch(`${API_URL}/profile/avatar`, {
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
      const res = await apiFetch(`${API_URL}/profile`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name,
          spiritualName: spiritualName || null,
          birthDate: birthDate || null,
          gender: gender || null,
          homeLocation,
          socialLinks,
          messengers,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const updated = (await res.json()) as UserProfile;
      setProfile(updated);
      setName(updated.name);
      setSpiritualName(updated.spiritualName ?? "");
      setBirthDate(updated.birthDate ?? "");
      setGender(updated.gender ?? "");
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
          const res = await apiFetch(
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
      <Card className="p-6">
        <CardTitle className="mb-4 text-lg">
          Аватар
        </CardTitle>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          {avatarSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={avatarSrc}
              alt={profile.displayName}
              className="h-24 w-24 rounded-full object-cover"
              referrerPolicy="no-referrer"
            />
          ) : (
            <span className="flex h-24 w-24 items-center justify-center rounded-full bg-glass text-3xl font-semibold text-text-0">
              {profile.displayName.charAt(0).toUpperCase()}
            </span>
          )}
          <div className="flex-1 space-y-3">
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={selectAvatar}
              className="block w-full text-sm text-text-1 file:mr-4 file:rounded-lg file:border-0 file:bg-mint file:px-4 file:py-2 file:text-sm file:font-medium file:text-on-mint"
            />
            <p className="text-xs text-text-2">JPG, PNG или WebP до 5 MB. Перед сохранением показывается preview.</p>
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={uploadAvatar}
                disabled={!avatarFile}
                loading={avatarPending}
              >
                {avatarPending ? "Сохраняем..." : "Сохранить аватар"}
              </Button>
              <Button
                variant="secondary"
                onClick={deleteAvatar}
                disabled={!profile.avatarUrl || avatarPending}
              >
                Удалить
              </Button>
            </div>
          </div>
        </div>
      </Card>

      <Card className="p-6">
        <CardTitle className="mb-2 text-lg">
          Имя
        </CardTitle>
        <p className="mb-4 text-sm text-text-1">
          Если указано духовное имя, именно оно видно другим — в знакомствах,
          справочнике контактов, чатах и комментариях. Обычное имя остаётся в
          профиле и видно только вам и администрации.
        </p>
        <div className="grid gap-4 md:grid-cols-2">
          <Input
            label="Обычное имя"
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={NAME_MAX_LENGTH}
            required
            placeholder="Максим Коробков"
            className="py-3"
          />
          <Input
            label="Духовное имя"
            type="text"
            value={spiritualName}
            onChange={(event) => setSpiritualName(event.target.value)}
            maxLength={NAME_MAX_LENGTH}
            placeholder="Мадхава дас"
            className="py-3"
          />
        </div>
        <p className="mt-3 text-sm text-text-2">
          Вас будут видеть как{" "}
          <span className="font-medium text-text-0">
            {spiritualName.trim() || name.trim() || "—"}
          </span>
          . Чтобы убрать духовное имя, очистите поле.
        </p>
      </Card>

      <UserGalleryEditor />

      <Card className="p-6">
        <CardTitle className="mb-2 text-lg">
          Дата рождения
        </CardTitle>
        <p className="mb-4 text-sm text-text-1">
          В знакомствах показывается только возраст — саму дату видите лишь вы.
          Видимость возраста настраивается в анкете Union.
        </p>
        <Input
          label="Дата рождения"
          type="date"
          value={birthDate}
          onChange={(event) => setBirthDate(event.target.value)}
          wrapperClassName="max-w-xs"
        />
        {profile.age != null && (
          <p className="mt-2 text-sm text-text-2">
            Возраст в карточке: {profile.age}
          </p>
        )}
        <label className="mt-4 block max-w-xs">
          <span className="mb-1 block text-xs text-text-2">Пол</span>
          <select
            value={gender}
            onChange={(event) => setGender(event.target.value)}
            className={fieldClassName}
          >
            <option value="">Не указан</option>
            <option value="male">Мужской</option>
            <option value="female">Женский</option>
          </select>
        </label>
        <p className="mt-2 text-sm text-text-2">
          Используется в фильтре знакомств. Если не указан, вы не попадёте в
          выдачу тех, кто ищет по полу.
        </p>

        <div className="mt-6 rounded-xl border border-gold/40 bg-gold/10 p-4">
          <p className="text-sm text-text-1">
            Для гороскопа и проверки совместимости по звёздам нужны ещё время
            и место рождения — их сервис астрологии хранит отдельно, дата
            рождения ими не заменяется.
          </p>
          <Link
            href="/astro"
            className={buttonClassName({ className: "mt-3" })}
          >
            Указать время и место рождения
          </Link>
        </div>
      </Card>

      <PhotoVerificationPanel profile={profile} onUpdated={setProfile} />

      <Card className="p-6">
        <CardTitle className="mb-2 text-lg">
          Город проживания
        </CardTitle>
        <p className="mb-4 text-sm text-text-1">
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
            className={`${fieldClassName} py-3`}
          />
          {locationResults.length > 0 && (
            <div className="absolute z-10 mt-2 max-h-72 w-full overflow-auto rounded-xl border border-glass-brd bg-bg-1 shadow-lg">
              {locationResults.map((item) => (
                <button
                  key={`${item.lat}-${item.lon}-${item.displayName}`}
                  type="button"
                  onClick={() => {
                    setHomeLocation(item);
                    setLocationQuery(item.displayName ?? item.city);
                    setLocationResults([]);
                  }}
                  className="block w-full px-4 py-3 text-left text-sm hover:bg-glass"
                >
                  <span className="block font-medium text-text-0">
                    {item.city}{item.country ? `, ${item.country}` : ""}
                  </span>
                  {item.displayName && (
                    <span className="block text-xs text-text-2">{item.displayName}</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            variant="secondary"
            onClick={detectLocation}
            loading={locationPending}
          >
            {locationPending ? "Ищем..." : "Определить моё местоположение"}
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              setHomeLocation(null);
              setLocationQuery("");
              setLocationResults([]);
            }}
          >
            Очистить город
          </Button>
        </div>
        {homeLocation && (
          <div className="mt-4 overflow-hidden rounded-xl border border-glass-brd">
            <div className="bg-bg-1 p-3 text-sm text-text-1">
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
      </Card>

      <Card className="p-6">
        <CardTitle className="mb-4 text-lg">
          Социальные сети
        </CardTitle>
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
      </Card>

      <Card className="p-6">
        <CardTitle className="mb-4 text-lg">
          Мессенджеры и контакты
        </CardTitle>
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
      </Card>

      {error && <Alert tone="error">{error}</Alert>}
      {message && <Alert tone="success">{message}</Alert>}

      <Button type="submit" loading={pending} className="w-full py-3">
        {pending ? "Сохраняем..." : "Сохранить изменения профиля"}
      </Button>
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
    <Input
      label={label}
      type={type}
      inputMode={type === "tel" ? "tel" : undefined}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      className="py-3"
    />
  );
}
