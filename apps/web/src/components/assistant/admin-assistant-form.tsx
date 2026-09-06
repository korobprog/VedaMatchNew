"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import type {
  AssistantAdminUsageDto,
  AssistantSettingsDto,
} from "@vedamatch/shared";
import { apiFetch } from "@/lib/http-client";
import { serviceLabel } from "./assistant-share";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

const NUMERIC_FIELDS = [
  {
    key: "dailyMessagesPerUser",
    label: "Вопросов на пользователя в сутки",
    hint: "Считаются и вопросы в чате, и просьбы помощника переписки. Ноль — без лимита.",
  },
  {
    key: "dailyTokensPerUser",
    label: "Токенов на пользователя в сутки",
    hint: "Второй предохранитель на случай очень длинных бесед. Ноль — без лимита.",
  },
  {
    key: "dailyTokenBudget",
    label: "Общий бюджет токенов в сутки",
    hint: "При достижении ассистент останавливается для всех до конца суток.",
  },
  {
    key: "dailyCostLimitUsdCents",
    label: "Дневной лимит расхода, центы",
    hint: "Работает, только если заданы цены модели в ASSISTANT_AI_USD_CENTS_PER_MTOK_*. Ноль — выключено.",
  },
  {
    key: "maxToolRounds",
    label: "Кругов поиска на один ответ",
    hint: "Сколько раз подряд модель может звать сервисы, прежде чем обязана ответить. Больше — точнее и дороже.",
  },
] as const;

const TOGGLES = [
  {
    key: "enabled",
    label: "Ассистент включён",
    hint: "Выключение прячет страницу, полосу на главной и помощника в чате.",
  },
  {
    key: "aiEnabled",
    label: "Обращения к модели включены",
    hint: "Аварийный выключатель: страница остаётся, новых ответов нет.",
  },
  {
    key: "chatHelperEnabled",
    label: "Помощник в поле ввода «Общения»",
    hint: "Кнопка «Ассистент» в панели вложений чата.",
  },
  {
    key: "actionsEnabled",
    label: "Действия по просьбе",
    hint: "Ассистент может предлагать публикацию рилса во Вдохновении — с подтверждением кнопкой.",
  },
] as const;

const formatTokens = (value: number) => value.toLocaleString("ru-RU");
const formatCents = (value: number) => `$${(value / 100).toFixed(2)}`;

export function AdminAssistantForm({
  initialSettings,
  usage,
}: {
  initialSettings: AssistantSettingsDto;
  usage: AssistantAdminUsageDto;
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
    void send("/admin/assistant/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings),
    });
  };

  const peakTokens = Math.max(
    1,
    ...usage.days.map((day) => day.tokensIn + day.tokensOut),
  );
  const todayTotal = usage.today.tokensIn + usage.today.tokensOut;
  const budgetLeft = Math.max(0, settings.dailyTokenBudget - todayTotal);
  const { metrics } = usage;

  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-glass-brd bg-bg-0 p-4">
        <h3 className="font-semibold text-text-0">Сегодня</h3>
        <p className="mt-1 text-sm text-text-2">
          Потрачено {formatTokens(todayTotal)} токенов
          {usage.today.costUsdCents > 0 && `, ${formatCents(usage.today.costUsdCents)}`}
          {" · осталось "}
          {formatTokens(budgetLeft)} из {formatTokens(settings.dailyTokenBudget)}
        </p>
        <p className="mt-1 text-xs text-text-2">
          {usage.configured
            ? `Модель: ${usage.model}`
            : "Ключ провайдера не задан — ассистент отвечает «не настроен». См. ASSISTANT_AI_* в .env."}
        </p>
        {usage.today.halted && (
          <div className="mt-3 rounded-xl bg-gold/15 p-3 text-sm">
            <p className="font-medium">Ответы остановлены автоматически.</p>
            <p className="mt-1 text-text-2">
              Дневной бюджет исчерпан. Страница ассистента открывается, новых
              ответов нет до конца суток.
            </p>
            <button
              type="button"
              disabled={pending}
              onClick={() => void send("/admin/assistant/resume", { method: "POST" })}
              className="btn-mint mt-2 rounded-lg px-3 py-1.5 text-sm font-medium disabled:opacity-50"
            >
              Снять остановку
            </button>
          </div>
        )}
      </section>

      <section>
        <h3 className="font-semibold text-text-0">Как пользуются</h3>
        <p className="mt-1 text-sm text-text-2">За показанный период.</p>
        <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "Людей спрашивало", value: metrics.activeUsers },
            { label: "Бесед начато", value: metrics.threads },
            { label: "Вопросов", value: metrics.questions },
            { label: "Ответов не вышло", value: metrics.failedAnswers },
            { label: "Помощник переписки", value: metrics.composeRequests },
            { label: "Действий предложено", value: metrics.actionsProposed },
            { label: "Действий подтверждено", value: metrics.actionsConfirmed },
            { label: "Токенов на ответ", value: metrics.avgTokensPerAnswer },
          ].map((item) => (
            <div key={item.label} className="rounded-xl border border-glass-brd p-3">
              <dt className="text-xs text-text-2">{item.label}</dt>
              <dd className="mt-0.5 font-mono text-xl font-bold tabular-nums text-text-0">
                {formatTokens(item.value)}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <section>
        <h3 className="font-semibold text-text-0">Какие сервисы спрашивают</h3>
        {metrics.tools.length === 0 ? (
          <p className="mt-2 text-sm text-text-2">Инструменты ещё не звали.</p>
        ) : (
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[28rem] border-collapse text-sm">
              <thead>
                <tr className="border-b border-glass-brd text-left text-text-2">
                  <th className="py-1.5 pr-3 font-medium">Сервис · инструмент</th>
                  <th className="py-1.5 pr-3 text-right font-medium">Вызовов</th>
                  <th className="py-1.5 pr-3 text-right font-medium">Сбоев</th>
                  <th className="py-1.5 text-right font-medium">Среднее, мс</th>
                </tr>
              </thead>
              <tbody>
                {metrics.tools.map((tool) => (
                  <tr key={tool.tool} className="border-b border-glass-brd/50">
                    <td className="py-1.5 pr-3">
                      {serviceLabel(tool.service)}
                      <span className="block font-mono text-xs text-text-2">{tool.tool}</span>
                    </td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">{tool.calls}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">{tool.failures}</td>
                    <td className="py-1.5 text-right tabular-nums">{tool.avgDurationMs}</td>
                  </tr>
                ))}
              </tbody>
            </table>
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
                <span className="block text-sm font-medium text-text-0">{toggle.label}</span>
                <span className="block text-xs text-text-2">{toggle.hint}</span>
              </span>
            </label>
          ))}
        </section>

        <section className="space-y-3">
          <h3 className="font-semibold text-text-0">Лимиты</h3>
          {NUMERIC_FIELDS.map((field) => (
            <label key={field.key} className="block">
              <span className="block text-sm font-medium text-text-0">{field.label}</span>
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

        <section className="space-y-2">
          <h3 className="font-semibold text-text-0">Дополнение к инструкции</h3>
          <p className="text-xs text-text-2">
            Тон, запреты, акценты — добавляется в конец системной инструкции
            модели. Основные правила (не выдумывать, искать только
            инструментами) зашиты и не правятся.
          </p>
          <textarea
            value={settings.systemPromptExtra}
            rows={5}
            maxLength={4000}
            onChange={(event) =>
              setSettings((current) => ({
                ...current,
                systemPromptExtra: event.target.value,
              }))
            }
            aria-label="Дополнение к инструкции"
            className="w-full rounded-xl border border-glass-brd bg-bg-0 px-3 py-2 text-sm text-text-0"
          />
        </section>

        {error && (
          <p className="rounded-xl bg-magenta/10 p-3 text-sm text-magenta">{error}</p>
        )}
        {saved && !error && (
          <p className="text-sm text-emerald-700 dark:text-emerald-400">Сохранено.</p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="btn-mint rounded-xl px-5 py-2.5 font-medium disabled:opacity-50"
        >
          {pending ? "Сохраняем…" : "Сохранить"}
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
                  <span className="w-24 shrink-0 tabular-nums text-text-2">{day.day}</span>
                  <span className="h-2 flex-1 overflow-hidden rounded-full bg-glass-brd">
                    <span
                      className={day.halted ? "block h-full bg-gold" : "block h-full bg-magenta"}
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
                  <th className="py-1.5 pr-3 text-right font-medium">Вопросов</th>
                  <th className="py-1.5 text-right font-medium">Токенов</th>
                </tr>
              </thead>
              <tbody>
                {usage.topConsumers.map((consumer) => (
                  <tr key={consumer.userId} className="border-b border-glass-brd/50">
                    <td className="py-1.5 pr-3">
                      {consumer.name}
                      <span className="block text-xs text-text-2">{consumer.email}</span>
                    </td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">{consumer.messages}</td>
                    <td className="py-1.5 text-right tabular-nums">{formatTokens(consumer.tokens)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
