"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ABOUT_MAX_LENGTH,
  LANGUAGES_MAX,
  NAME_MAX_LENGTH,
  type AdminUserProfile,
  type Gender,
  type ProfileLocation,
} from "@vedamatch/shared";
import { CityPicker } from "@/components/city-picker";
import { apiFetch } from "@/lib/http-client";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input, fieldClassName } from "@/components/ui/input";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const REASON_MAX_LENGTH = 300;

// Пустой вариант остался только для старых профилей, у которых пола нет:
// выбрать его заново нельзя, а сохранение такого профиля просто не трогает
// поле — сервер очистку пола не принимает, см. `UsersService.updateProfile`.
const genders: Array<{ value: "" | Gender; label: string }> = [
  { value: "", label: "Не указан" },
  { value: "male", label: "Мужской" },
  { value: "female", label: "Женский" },
];

/**
 * Портальные поля профиля глазами администрации: имя, пол, дата рождения,
 * город, рассказ и языки. Анкета Знакомств их не хранит и править не может —
 * они лежат в `User`, и единственная ручка на них — `admin/users/:id/profile`.
 */
export function AdminUserProfileForm({
  profile,
  isSelf,
}: {
  profile: AdminUserProfile;
  isSelf: boolean;
}) {
  const router = useRouter();
  const [name, setName] = useState(profile.name);
  const [spiritualName, setSpiritualName] = useState(
    profile.spiritualName ?? "",
  );
  const [gender, setGender] = useState<"" | Gender>(profile.gender ?? "");
  const [birthDate, setBirthDate] = useState(profile.birthDate ?? "");
  const [about, setAbout] = useState(profile.about ?? "");
  const [languages, setLanguages] = useState<string[]>(profile.languages ?? []);
  const [homeLocation, setHomeLocation] = useState<ProfileLocation | null>(
    profile.homeLocation ?? null,
  );
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSaved(false);
    setPending(true);

    try {
      const res = await apiFetch(`${API_URL}/admin/users/${profile.id}/profile`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          spiritualName,
          // Пол очистить нельзя: он обязателен. Пустое значение означает
          // «не трогать», иначе правка старого профиля упиралась бы в отказ.
          ...(gender ? { gender } : {}),
          birthDate: birthDate || null,
          about,
          // Пустые строки из полей ввода — не языки: сервер их не отфильтрует
          // обратно в имя языка, а сохранит пустой пункт в списке.
          languages: languages.map((item) => item.trim()).filter(Boolean),
          homeLocation,
          reason,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      setReason("");
      setSaved(true);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось сохранить профиль");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {error && <Alert tone="error">{error}</Alert>}
      {saved && !error && (
        <Alert tone="success">
          Профиль сохранён. Человеку ушло уведомление об изменении.
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          label="Имя"
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={NAME_MAX_LENGTH}
          required
        />
        <Input
          label="Духовное имя"
          value={spiritualName}
          onChange={(event) => setSpiritualName(event.target.value)}
          maxLength={NAME_MAX_LENGTH}
          placeholder="необязательно"
        />
        <label className="block text-sm font-medium text-text-1">
          Пол
          <select
            value={gender}
            onChange={(event) => setGender(event.target.value as "" | Gender)}
            className={`mt-1 ${fieldClassName}`}
          >
            {genders.map((item) => (
              <option
                key={item.value}
                value={item.value}
                disabled={item.value === ""}
              >
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <Input
          label="Дата рождения"
          type="date"
          value={birthDate}
          onChange={(event) => setBirthDate(event.target.value)}
        />
      </div>

      <p className="text-xs text-text-2">
        Пол участвует в подборе Знакомств: без него человек не попадает в выдачу
        тех, кто ищет по полу. Дата рождения наружу не отдаётся — только возраст.
      </p>

      <label className="block text-sm font-medium text-text-1">
        Рассказ о себе
        <textarea
          value={about}
          onChange={(event) => setAbout(event.target.value)}
          maxLength={ABOUT_MAX_LENGTH}
          rows={4}
          className={`mt-1 ${fieldClassName}`}
        />
      </label>

      <div>
        <span className="mb-1 block text-sm font-medium text-text-1">Языки</span>
        {languages.length === 0 && (
          <p className="text-sm text-text-2">Не указаны.</p>
        )}
        <div className="flex flex-col gap-2">
          {languages.map((language, index) => (
            <div key={index} className="flex max-w-sm items-center gap-2">
              <input
                type="text"
                value={language}
                onChange={(event) =>
                  setLanguages((current) =>
                    current.map((item, i) =>
                      i === index ? event.target.value : item,
                    ),
                  )
                }
                maxLength={40}
                placeholder="русский"
                className={fieldClassName}
              />
              <button
                type="button"
                onClick={() =>
                  setLanguages((current) =>
                    current.filter((_, i) => i !== index),
                  )
                }
                aria-label={`Убрать язык ${language || index + 1}`}
                className="shrink-0 rounded-xl border border-glass-brd px-3 py-2 text-sm text-text-1 hover:text-text-0"
              >
                ×
              </button>
            </div>
          ))}
        </div>
        {languages.length < LANGUAGES_MAX && (
          <button
            type="button"
            onClick={() => setLanguages((current) => [...current, ""])}
            className="mt-2 rounded-xl border border-glass-brd px-4 py-2 text-sm text-text-1 hover:text-text-0"
          >
            Добавить язык
          </button>
        )}
      </div>

      <div>
        <span className="mb-1 block text-sm font-medium text-text-1">Город</span>
        <CityPicker
          value={homeLocation}
          onChange={setHomeLocation}
          onError={setError}
        />
      </div>

      <Input
        label="Пояснение (уйдёт человеку в уведомлении)"
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        maxLength={REASON_MAX_LENGTH}
        placeholder="Например: поправили пол по просьбе в поддержку"
      />

      <p className="text-xs text-text-2">
        {isSelf
          ? "Это ваш собственный аккаунт: правка попадёт в журнал, уведомление не уйдёт."
          : "Правка попадёт в журнал действий, а человек получит уведомление о том, какие поля изменены."}
      </p>

      <Button type="submit" loading={pending}>
        {pending ? "Сохраняем…" : "Сохранить профиль"}
      </Button>
    </form>
  );
}
