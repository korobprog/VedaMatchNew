"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import {
  REGISTRATION_NOTE_MAX_LENGTH,
  type AdminPlatformSettings,
  type BillingMode,
  type RegistrationMode,
} from "@vedamatch/shared";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { updatePlatformSettings } from "@/lib/settings-admin-api";

const BILLING_LABELS: Record<BillingMode, string> = {
  beta: "Бета — доступ бесплатный для всех",
  business: "Обычный — работает тариф и пробный период",
};

const REGISTRATION_LABELS: Record<RegistrationMode, string> = {
  open: "Открыта — новые аккаунты заводятся сами",
  closed: "Закрыта — новых не пускаем, старые входят",
};

const field =
  "mt-1 w-full rounded-xl border border-glass-brd bg-bg-1 px-3 py-2 text-sm text-text-0 placeholder:text-text-2";

export function PlatformSettingsForm({
  settings,
}: {
  settings: AdminPlatformSettings;
}) {
  const router = useRouter();
  const [registrationMode, setRegistrationMode] = useState<RegistrationMode>(
    settings.registrationMode,
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setPending(true);
    setError(null);
    setSaved(false);
    try {
      await updatePlatformSettings({
        billingMode: String(data.get("billingMode") ?? "") as BillingMode,
        registrationMode,
        registrationNote: String(data.get("registrationNote") ?? "").trim(),
      });
      setSaved(true);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось сохранить");
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="glass space-y-5 rounded-2xl border border-glass-brd p-4"
    >
      {error && <Alert tone="error">{error}</Alert>}
      {saved && <Alert tone="success">Настройки сохранены.</Alert>}

      <label className="block text-sm font-medium text-text-1">
        Режим биллинга
        <select
          name="billingMode"
          defaultValue={settings.billingMode}
          className={field}
        >
          {(Object.keys(BILLING_LABELS) as BillingMode[]).map((mode) => (
            <option key={mode} value={mode}>
              {BILLING_LABELS[mode]}
            </option>
          ))}
        </select>
        <span className="mt-1 block text-xs text-text-2">
          Меняет доступ сразу всем: в бете подписка не проверяется.
        </span>
      </label>

      <label className="block text-sm font-medium text-text-1">
        Регистрация
        <select
          name="registrationMode"
          value={registrationMode}
          onChange={(event) =>
            setRegistrationMode(event.target.value as RegistrationMode)
          }
          className={field}
        >
          {(Object.keys(REGISTRATION_LABELS) as RegistrationMode[]).map(
            (mode) => (
              <option key={mode} value={mode}>
                {REGISTRATION_LABELS[mode]}
              </option>
            ),
          )}
        </select>
        <span className="mt-1 block text-xs text-text-2">
          Закрытая регистрация не мешает входить уже заведённым — отказ получает
          только тот, для кого пришлось бы создать новую запись.
        </span>
      </label>

      {registrationMode === "closed" && (
        <label className="block text-sm font-medium text-text-1">
          Что показать при отказе
          <textarea
            name="registrationNote"
            defaultValue={settings.registrationNote ?? ""}
            rows={2}
            maxLength={REGISTRATION_NOTE_MAX_LENGTH}
            placeholder="Регистрация новых участников сейчас закрыта"
            className={field}
          />
          <span className="mt-1 block text-xs text-text-2">
            Пусто — покажем общий текст.
          </span>
        </label>
      )}

      <Button type="submit" loading={pending}>
        Сохранить настройки
      </Button>
    </form>
  );
}
