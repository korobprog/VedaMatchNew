"use client";

import { useEffect, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/http-client";

type ProviderRow = {
  provider: "google" | "yandex" | "vk" | "email";
  enabled: boolean;
  domains: string[];
  sortOrder: number;
  updatedAt: string;
  /** Заданы ли ключи в окружении. Сами ключи наружу не отдаются. */
  configured: boolean;
};

const LABELS: Record<ProviderRow["provider"], string> = {
  google: "Google",
  yandex: "Яндекс ID",
  vk: "VK ID",
  email: "Вход по почте",
};

/**
 * Способы входа. До этого раздела включить провайдера можно было только
 * SQL-запросом внутрь контейнера — вслепую и без журнала.
 *
 * Домены редактируются строкой через запятую: их редко больше двух, а
 * отдельный редактор списка на такой случай — лишняя механика.
 */
export function AdminAuthProvidersView() {
  const [rows, setRows] = useState<ProviderRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  useEffect(() => {
    let alive = true;
    apiFetch("/auth/admin/providers")
      .then(async (res) => {
        if (!res.ok) throw new Error(`Не удалось загрузить: ${res.status}`);
        return (await res.json()) as ProviderRow[];
      })
      .then((data) => {
        if (!alive) return;
        setRows(data);
        setDrafts(
          Object.fromEntries(data.map((r) => [r.provider, r.domains.join(", ")])),
        );
      })
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, []);

  async function patch(provider: string, body: Record<string, unknown>) {
    setPending(provider);
    setError(null);
    try {
      const res = await apiFetch(`/auth/admin/providers/${provider}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = (await res.json()) as ProviderRow & { message?: string };
      if (!res.ok) throw new Error(payload.message ?? "Не удалось сохранить");
      setRows((current) =>
        (current ?? []).map((row) =>
          row.provider === provider ? payload : row,
        ),
      );
      setDrafts((current) => ({
        ...current,
        [provider]: payload.domains.join(", "),
      }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPending(null);
    }
  }

  if (error && !rows) return <Alert tone="error">{error}</Alert>;
  if (!rows) return <p className="text-sm text-text-2">Загружаем…</p>;

  return (
    <div className="flex flex-col gap-4">
      {error && <Alert tone="error">{error}</Alert>}

      {rows.map((row) => {
        const busy = pending === row.provider;
        const draft = drafts[row.provider] ?? "";
        const domainsChanged = draft !== row.domains.join(", ");

        return (
          <section
            key={row.provider}
            className="glass rounded-2xl border border-glass-brd p-5"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <h2 className="font-display text-lg font-semibold text-text-0">
                  {LABELS[row.provider]}
                </h2>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs ${
                    row.enabled
                      ? "bg-cyan/15 text-text-0"
                      : "bg-white/10 text-text-1"
                  }`}
                >
                  {row.enabled ? "включён" : "выключен"}
                </span>
                {!row.configured && (
                  <span className="rounded-full bg-gold/15 px-2 py-0.5 text-xs text-text-0">
                    ключи не заданы
                  </span>
                )}
              </div>

              <Button
                type="button"
                variant={row.enabled ? "secondary" : "primary"}
                disabled={busy || (!row.enabled && !row.configured)}
                onClick={() => void patch(row.provider, { enabled: !row.enabled })}
              >
                {row.enabled ? "Выключить" : "Включить"}
              </Button>
            </div>

            {!row.configured && (
              <p className="mt-3 text-sm text-text-1">
                Включить нельзя, пока не заданы ключи провайдера в переменных
                окружения: снаружи это была бы кнопка, которая у всех падает.
              </p>
            )}

            <div className="mt-4 flex flex-col gap-2">
              <label
                className="text-xs uppercase tracking-wide text-text-2"
                htmlFor={`domains-${row.provider}`}
              >
                Домены показа
              </label>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  id={`domains-${row.provider}`}
                  value={draft}
                  onChange={(event) =>
                    setDrafts((current) => ({
                      ...current,
                      [row.provider]: event.target.value,
                    }))
                  }
                  placeholder="vedamatch.ru, localhost"
                  className="min-w-0 flex-1 rounded-xl border border-glass-brd bg-white/5 px-3 py-2 text-sm text-text-0"
                />
                <Button
                  type="button"
                  variant="secondary"
                  disabled={busy || !domainsChanged}
                  onClick={() =>
                    void patch(row.provider, {
                      domains: draft
                        .split(",")
                        .map((part) => part.trim())
                        .filter(Boolean),
                    })
                  }
                >
                  Сохранить
                </Button>
              </div>
              <p className="text-xs text-text-2">
                Домен сайта, а не адрес API: <code>api.</code> и протокол
                отбрасываются при сохранении. Пусто — способ не показывается
                нигде.
              </p>
            </div>

            <div className="mt-4 flex items-center gap-2">
              <span className="text-xs uppercase tracking-wide text-text-2">
                Порядок
              </span>
              <Button
                type="button"
                variant="secondary"
                disabled={busy || row.sortOrder === 0}
                onClick={() =>
                  void patch(row.provider, { sortOrder: row.sortOrder - 1 })
                }
              >
                Выше
              </Button>
              <span className="font-mono text-sm text-text-1">
                {row.sortOrder}
              </span>
              <Button
                type="button"
                variant="secondary"
                disabled={busy}
                onClick={() =>
                  void patch(row.provider, { sortOrder: row.sortOrder + 1 })
                }
              >
                Ниже
              </Button>
            </div>
          </section>
        );
      })}
    </div>
  );
}
