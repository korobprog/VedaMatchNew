"use client";

import { useEffect, useState } from "react";
import { KeyRound } from "lucide-react";
import {
  createApiKey,
  fetchApiKeys,
  revokeApiKey,
  type ApiKeyDto,
  type IssuedApiKeyDto,
} from "@/lib/api-keys-api";

/** Права, которые сейчас можно выдать. Совпадает с ALLOWED_API_KEY_SCOPES. */
const SCOPES = [
  {
    key: "work:read",
    label: "Читать «Работу»",
    about: "Видеть среды, доски, карточки и сроки",
  },
  {
    key: "work:write",
    label: "Изменять «Работу»",
    about: "Заводить задачи, переносить их, комментировать",
  },
] as const;

/**
 * Персональные ключи доступа.
 *
 * Ключ нужен программам, которым негде показать браузер: MCP-клиенту, скрипту,
 * интеграции. Он персональный — у напарника свой, и видит он через него только
 * то, к чему допущен сам.
 *
 * Показанный раз ключ больше не показывается: в базе лежит только хеш. Поэтому
 * выпуск устроен как разовое окно с предупреждением, а не как строка в списке,
 * которую можно переоткрыть.
 */
export function ApiKeysSettings() {
  const [keys, setKeys] = useState<ApiKeyDto[] | null>(null);
  const [issued, setIssued] = useState<IssuedApiKeyDto | null>(null);
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<string[]>(["work:read"]);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    void fetchApiKeys()
      .then(setKeys)
      .catch(() => setKeys([]));
  }, []);

  async function issue() {
    setBusy(true);
    setProblem(null);
    try {
      const key = await createApiKey({ name: name.trim(), scopes });
      setIssued(key);
      setName("");
      setKeys(await fetchApiKeys());
    } catch (error) {
      setProblem(error instanceof Error ? error.message : "Не получилось");
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id: string) {
    setBusy(true);
    try {
      await revokeApiKey(id);
      setKeys(await fetchApiKeys());
    } finally {
      setBusy(false);
    }
  }

  function toggleScope(scope: string) {
    setScopes((current) =>
      current.includes(scope)
        ? current.filter((item) => item !== scope)
        : [...current, scope],
    );
  }

  return (
    <section className="rounded-2xl border border-[var(--vm-glass-border)] bg-[var(--vm-bg-1)] p-5">
      <h2 className="flex items-center gap-2 font-[family-name:var(--font-display)] text-lg text-[var(--vm-text-0)]">
        <KeyRound className="size-5" aria-hidden />
        Ключи доступа
      </h2>
      <p className="mt-2 text-sm text-[var(--vm-text-2)]">
        Ключ позволяет программе работать с порталом от вашего имени — например,
        ассистенту в Claude через MCP. Ключ видит ровно то, к чему допущены вы.
      </p>

      {issued && (
        <div className="mt-4 rounded-xl border border-[var(--vm-gold)] bg-[var(--vm-bg-2)] p-4">
          <p className="text-sm font-semibold text-[var(--vm-text-0)]">
            Ключ «{issued.name}» выпущен
          </p>
          <p className="mt-1 text-sm text-[var(--vm-text-2)]">
            Скопируйте его сейчас: portal хранит только отпечаток, и показать
            ключ второй раз будет невозможно.
          </p>
          <code className="mt-3 block overflow-x-auto rounded-lg bg-[var(--vm-bg-0)] p-3 font-[family-name:var(--font-mono)] text-xs text-[var(--vm-text-0)]">
            {issued.token}
          </code>
          <div className="mt-3 flex gap-3">
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard.writeText(issued.token);
                setCopied(true);
              }}
              className="rounded-xl bg-[var(--vm-magenta)] px-3 py-2 text-sm font-semibold text-white"
            >
              {copied ? "Скопировано" : "Скопировать"}
            </button>
            <button
              type="button"
              onClick={() => {
                setIssued(null);
                setCopied(false);
              }}
              className="text-sm text-[var(--vm-text-2)]"
            >
              Я сохранил
            </button>
          </div>
        </div>
      )}

      <div className="mt-5 space-y-3">
        <label className="block text-sm text-[var(--vm-text-1)]">
          Название
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Claude на ноутбуке"
            maxLength={60}
            className="mt-1 w-full rounded-xl border border-[var(--vm-glass-border)] bg-[var(--vm-bg-2)] px-3 py-2 text-sm text-[var(--vm-text-0)]"
          />
        </label>

        <fieldset className="space-y-2">
          <legend className="text-sm text-[var(--vm-text-1)]">Что можно</legend>
          {SCOPES.map((scope) => (
            <label key={scope.key} className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={scopes.includes(scope.key)}
                onChange={() => toggleScope(scope.key)}
                className="mt-1"
              />
              <span>
                <span className="text-[var(--vm-text-0)]">{scope.label}</span>
                <span className="block text-xs text-[var(--vm-text-2)]">
                  {scope.about}
                </span>
              </span>
            </label>
          ))}
        </fieldset>

        {problem && (
          <p role="alert" className="text-sm text-[var(--vm-magenta)]">
            {problem}
          </p>
        )}

        <button
          type="button"
          onClick={() => void issue()}
          disabled={busy || !name.trim() || scopes.length === 0}
          className="rounded-xl bg-[var(--vm-magenta)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          Выпустить ключ
        </button>
      </div>

      {keys && keys.length > 0 && (
        <ul className="mt-6 space-y-2">
          {keys.map((key) => (
            <li
              key={key.id}
              className="flex items-center justify-between gap-3 rounded-xl bg-[var(--vm-bg-2)] px-3 py-2 text-sm"
            >
              <span className="min-w-0">
                <span className="block truncate text-[var(--vm-text-0)]">
                  {key.name}
                </span>
                <span className="block text-xs text-[var(--vm-text-2)]">
                  {key.hint} · {key.scopes.join(", ")} ·{" "}
                  {key.lastUsedAt
                    ? `использован ${new Date(key.lastUsedAt).toLocaleDateString("ru-RU")}`
                    : "ещё не использован"}
                </span>
              </span>
              <button
                type="button"
                onClick={() => void revoke(key.id)}
                disabled={busy}
                className="shrink-0 text-sm text-[var(--vm-magenta)] disabled:opacity-50"
              >
                Отозвать
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
