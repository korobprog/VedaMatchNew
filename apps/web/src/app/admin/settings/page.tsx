import { redirect } from "next/navigation";
import type { AdminIntegrationStatus } from "@vedamatch/shared";
import { PlatformSettingsForm } from "@/components/admin/platform-settings-form";
import { formatDate } from "@/lib/admin-labels";
import { AdminDonationForm } from "@/components/admin-donation-form";
import { getAdminDonationSettings, getAdminPlatformSettings } from "@/lib/api";
import { requireUser } from "@/lib/require-user";

export const metadata = {
  title: "Настройки платформы",
  robots: { index: false, follow: false },
};

/** Что сломается, если интеграция не настроена. */
const INTEGRATIONS: Record<
  AdminIntegrationStatus["key"],
  { label: string; breaks: string }
> = {
  "google-oauth": {
    label: "Вход через Google",
    breaks: "никто не войдёт, кроме dev-входа по паролю",
  },
  storage: {
    label: "Хранилище файлов (S3)",
    breaks: "не загружаются аватары, фото и обложки",
  },
  push: {
    label: "Веб-пуши (VAPID)",
    breaks: "уведомления идут только в колокольчик",
  },
  redis: {
    label: "Redis",
    breaks: "фоновые воркеры работают без лиза — нельзя запускать вторую копию",
  },
  "motivation-ai": {
    label: "Motivation: тексты",
    breaks: "цитаты не подбираются и не переводятся",
  },
  "motivation-media": {
    label: "Motivation: картинки и видео (fal)",
    breaks: "очередь генерации стоит",
  },
  "astro-ai": {
    label: "Astro: разборы",
    breaks: "карты рождения и совместимость не считаются",
  },
};

export default async function AdminSettingsPage() {
  const user = await requireUser();
  if (user.role !== "admin") redirect("/");

  const [settings, donation] = await Promise.all([
    getAdminPlatformSettings(),
    getAdminDonationSettings(),
  ]);
  if (!settings) throw new Error("Не удалось загрузить настройки");

  const broken = settings.integrations.filter(
    (integration) => !integration.configured,
  );

  return (
    <>
      <h1 className="font-display text-2xl font-bold text-text-0 sm:text-3xl">
        Настройки платформы
      </h1>
      <p className="mb-6 mt-1 text-sm text-text-1">
        Глобальные параметры, которые видят все участники.
        {settings.updatedAt && ` Последнее изменение: ${formatDate(settings.updatedAt)}.`}
      </p>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
        <div className="space-y-6">
          <PlatformSettingsForm settings={settings} />
          <AdminDonationForm
            initial={donation ?? { enabled: false, text: "", requisites: [] }}
          />
        </div>

        <section aria-labelledby="integrations">
          <h2
            id="integrations"
            className="mb-2 font-display text-lg font-semibold text-text-0"
          >
            Интеграции
          </h2>
          <p className="mb-3 text-sm text-text-1">
            Что задано в окружении сервера. Значения ключей сюда не приходят —
            только факт настройки и имена недостающих переменных.
          </p>

          {broken.length === 0 && (
            <p className="mb-3 text-sm text-text-1">Настроено всё.</p>
          )}

          <ul className="space-y-2">
            {settings.integrations.map((integration) => (
              <li
                key={integration.key}
                className="glass rounded-2xl border border-glass-brd p-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm text-text-0">
                    {INTEGRATIONS[integration.key].label}
                  </span>
                  <span
                    className={[
                      "rounded-full border px-2 py-0.5 text-xs",
                      integration.configured
                        ? "border-glass-brd text-text-2"
                        : "border-magenta/40 text-text-1",
                    ].join(" ")}
                  >
                    {integration.configured ? "настроено" : "не настроено"}
                  </span>
                </div>
                {!integration.configured && (
                  <>
                    <p className="mt-1 text-sm text-text-1">
                      Без неё: {INTEGRATIONS[integration.key].breaks}.
                    </p>
                    <p className="mt-1 font-mono text-xs text-text-2">
                      не хватает: {integration.missing.join(", ")}
                    </p>
                  </>
                )}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}
