"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import type { AstroAdminUsageDto, AstroSettingsDto } from "@vedamatch/shared";
import { apiFetch } from "@/lib/http-client";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

const NUMERIC_FIELDS = [
  {
    key: "dailyReadingsPerUser",
    label: "Разборов на пользователя в сутки",
    hint: "Сколько новых текстов человек может получить за день. Готовые из кэша не считаются.",
  },
  {
    key: "dailyTokensPerUser",
    label: "Токенов на пользователя в сутки",
    hint: "Второй предохранитель на случай необычно длинных разборов.",
  },
  {
    key: "dailyTokenBudget",
    label: "Общий бюджет токенов в сутки",
    hint: "При достижении генерация останавливается до конца суток. Карта продолжает работать.",
  },
  {
    key: "dailyCostLimitUsdCents",
    label: "Дневной лимит расхода, центы",
    hint: "Работает, только если заданы цены модели в ASTRO_AI_USD_CENTS_PER_MTOK_*. Ноль — выключено.",
  },
] as const;

const TOGGLES = [
  {
    key: "enabled",
    label: "Сервис включён",
    hint: "Выключение прячет астрологию целиком.",
  },
  {
    key: "aiEnabled",
    label: "Генерация разборов включена",
    hint: "Аварийный выключатель. Карта, даши и готовые тексты остаются, новые не создаются.",
  },
  {
    key: "transitPushEnabled",
    label: "Ежедневные пуши о транзитах",
    hint: "Рассылка дневных дайджестов.",
  },
] as const;

const formatTokens = (value: number) => value.toLocaleString("ru-RU");
const formatCents = (value: number) => `$${(value / 100).toFixed(2)}`;

export function AdminAstroForm({
  initialSettings,
  usage,
}: {
  initialSettings: AstroSettingsDto;
  usage: AstroAdminUsageDto;
}) {
  const router = useRouter();
  const [settings, setSettings] = useState(initialSettings);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function send(path: string, init: RequestInit) {
    setError(null);
    setSaved(false);
    setPending(true);
    try {
      const res = await apiFetch(`${API_URL}${path}`, {
        credentials: "include",
        ...init,
      });
      if (!res.ok) {
        const message = await res
          .json()
          .then((body: { message?: string }) => body.message)
          .catch(() => undefined);
        throw new Error(message ?? `Ошибка ${res.status}`);
      }
      setSaved(true);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось сохранить");
    } finally {
      setPending(false);
    }
  }

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void send("/admin/astro/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings),
    });
  };

  const peakTokens = Math.max(
    1,
    ...usage.days.map((day) => day.tokensIn + day.tokensOut),
  );

  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-glass-brd bg-bg-0 p-4">
        <h3 className="font-semibold text-text-0">Расход сегодня</h3>
        <p className="mt-1 text-sm text-text-2">
          {formatTokens(usage.today.tokensIn + usage.today.tokensOut)} токенов
          {usage.today.costUsdCents > 0 &&
            `, ${formatCents(usage.today.costUsdCents)}`}
          {" · лимит "}
          {formatTokens(settings.dailyTokenBudget)}
        </p>

        {usage.today.halted && (
          <div className="mt-3 rounded-xl bg-gold/15 p-3 text-sm">
            <p className="font-medium">Генерация остановлена автоматически.</p>
            <p className="mt-1 text-text-2">
              Дневной бюджет исчерпан. Карта, даши и готовые разборы работают;
              новые тексты не создаются до конца суток.
            </p>
            <button
              type="button"
              disabled={pending}
              onClick={() => void send("/admin/astro/resume", { method: "POST" })}
              className="mt-2 rounded-lg btn-mint px-3 py-1.5 text-sm font-medium disabled:opacity-50"
            >
              Снять остановку
            </button>
          </div>
        )}
      </section>

      <form onSubmit={submit} className="space-y-6">
        <section className="space-y-3">
          <h3 className="font-semibold text-text-0">Переключатели</h3>
          {TOGGLES.map((toggle) => (
            <label
              key={toggle.key}
              className="flex items-start gap-3 rounded-xl border border-glass-brd bg-bg-0 p-3"
            >
              <input
                type="checkbox"
                className="mt-1"
                checked={settings[toggle.key]}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    [toggle.key]: event.target.checked,
                  }))
                }
              />
              <span>
                <span className="block text-sm font-medium text-text-0">
                  {toggle.label}
                </span>
                <span className="block text-xs text-text-2">{toggle.hint}</span>
              </span>
            </label>
          ))}
        </section>

        <section className="space-y-3">
          <h3 className="font-semibold text-text-0">Лимиты</h3>
          {NUMERIC_FIELDS.map((field) => (
            <label key={field.key} className="block">
              <span className="block text-sm font-medium text-text-0">
                {field.label}
              </span>
              <span className="block text-xs text-text-2">{field.hint}</span>
              <input
                type="number"
                min={0}
                step={1}
                value={settings[field.key]}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    [field.key]: Number(event.target.value),
                  }))
                }
                className="mt-1 w-full rounded-xl border border-glass-brd bg-bg-0 px-3 py-2 text-sm text-text-0"
              />
            </label>
          ))}
        </section>

        {error && (
          <p className="rounded-xl bg-magenta/10 p-3 text-sm text-magenta">
            {error}
          </p>
        )}
        {saved && !error && (
          <p className="text-sm text-emerald-700 dark:text-emerald-400">
            Сохранено.
          </p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="btn-mint rounded-xl px-5 py-2.5 font-medium disabled:opacity-50"
        >
          {pending ? "Сохраняем…" : "Сохранить лимиты"}
        </button>
      </form>

      <section>
        <h3 className="font-semibold text-text-0">Расход по дням</h3>
        {usage.days.length === 0 ? (
          <p className="mt-2 text-sm text-text-2">Расхода пока не было.</p>
        ) : (
          <ul className="mt-2 space-y-1">
            {usage.days.map((day) => {
              const total = day.tokensIn + day.tokensOut;
              return (
                <li key={day.day} className="flex items-center gap-3 text-sm">
                  <span className="w-24 shrink-0 tabular-nums text-text-2">
                    {day.day}
                  </span>
                  {/* Полоса вместо графика: масштаб виден, зависимостей ноль. */}
                  <span className="h-2 flex-1 overflow-hidden rounded-full bg-glass-brd">
                    <span
                      className={
                        day.halted
                          ? "block h-full bg-gold"
                          : "block h-full bg-magenta"
                      }
                      style={{ width: `${(total / peakTokens) * 100}%` }}
                    />
                  </span>
                  <span className="w-28 shrink-0 text-right tabular-nums text-text-2">
                    {formatTokens(total)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section>
        <h3 className="font-semibold text-text-0">Кто расходует больше всех</h3>
        {usage.topConsumers.length === 0 ? (
          <p className="mt-2 text-sm text-text-2">Пока никто.</p>
        ) : (
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[28rem] border-collapse text-sm">
              <thead>
                <tr className="border-b border-glass-brd text-left text-text-2">
                  <th className="py-1.5 pr-3 font-medium">Пользователь</th>
                  <th className="py-1.5 pr-3 text-right font-medium">Разборов</th>
                  <th className="py-1.5 text-right font-medium">Токенов</th>
                </tr>
              </thead>
              <tbody>
                {usage.topConsumers.map((consumer) => (
                  <tr
                    key={consumer.userId}
                    className="border-b border-glass-brd/50"
                  >
                    <td className="py-1.5 pr-3">
                      {consumer.name}
                      <span className="block text-xs text-text-2">
                        {consumer.email}
                      </span>
                    </td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">
                      {consumer.readings}
                    </td>
                    <td className="py-1.5 text-right tabular-nums">
                      {formatTokens(consumer.tokens)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <h3 className="font-semibold text-text-0">Книги карт астрологов</h3>
        {/* Только объём. Сами записи видит лишь их владелец, и админка их не
            читает — иначе «карта человека, которого я веду» перестала бы быть
            личной заметкой. */}
        <p className="mt-1 text-sm text-text-2">
          Числа, и ничего кроме: ни имён, ни дат рождения из записей здесь нет.
        </p>
        <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "Всего записей", value: usage.subjects.total },
            { label: "Владельцев", value: usage.subjects.owners },
            { label: "Заведено за период", value: usage.subjects.createdInWindow },
            { label: "Самая большая книга", value: usage.subjects.largestBook },
          ].map((item) => (
            <div
              key={item.label}
              className="rounded-xl border border-glass-brd p-3"
            >
              <dt className="text-xs text-text-2">{item.label}</dt>
              <dd className="mt-0.5 font-mono text-xl font-bold tabular-nums text-text-0">
                {item.value}
              </dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}
