"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/http-client";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { apiBase } from "@/lib/api-base";

const API_URL = apiBase();

interface AdminApiKey {
  id: string;
  name: string;
  hint: string;
  scopes: string[];
  lastUsedAt: string | null;
  expiresAt: string | null;
  revoked: boolean;
  createdAt: string;
}

/**
 * Ключи доступа человека — глазами администрации.
 *
 * Выпустить ключ отсюда нельзя: ключ, выданный за человека, подписывал бы его
 * именем чужие действия. Можно только погасить — ради того случая, ради
 * которого раздел и заведён: человек ушёл из проекта, а его ключ продолжает
 * ходить в доски, пока сам владелец про него не вспомнит.
 */
export function AdminUserApiKeys({ userId }: { userId: string }) {
  const [keys, setKeys] = useState<AdminApiKey[] | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const response = await apiFetch(`${API_URL}/admin/api-keys/user/${userId}`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error(`Не удалось загрузить: ${response.status}`);
      setKeys((await response.json()) as AdminApiKey[]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось загрузить");
      setKeys([]);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  async function revoke(id: string) {
    setPending(true);
    setError(null);
    try {
      const response = await apiFetch(`${API_URL}/admin/api-keys/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!response.ok) throw new Error(`Не удалось отозвать: ${response.status}`);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось отозвать");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="rounded-2xl border border-[var(--vm-glass-border)] bg-[var(--vm-bg-1)] p-5">
      <h2 className="font-[family-name:var(--font-display)] text-base text-[var(--vm-text-0)]">
        Ключи доступа
      </h2>
      <p className="mt-1 text-sm text-[var(--vm-text-2)]">
        Ключи, которыми программы работают с порталом от имени этого человека.
        Выпустить ключ за него нельзя — только отозвать.
      </p>

      {error && (
        <div className="mt-3">
          <Alert>{error}</Alert>
        </div>
      )}

      {keys && keys.length === 0 && (
        <p className="mt-3 text-sm text-[var(--vm-text-2)]">Ключей нет.</p>
      )}

      {keys && keys.length > 0 && (
        <ul className="mt-4 space-y-2">
          {keys.map((key) => (
            <li
              key={key.id}
              className="flex items-center justify-between gap-3 rounded-xl bg-[var(--vm-bg-2)] px-3 py-2 text-sm"
            >
              <span className="min-w-0">
                <span className="block truncate text-[var(--vm-text-0)]">
                  {key.name}
                  {key.revoked && (
                    <span className="ml-2 text-xs text-[var(--vm-text-2)]">
                      отозван
                    </span>
                  )}
                </span>
                <span className="block text-xs text-[var(--vm-text-2)]">
                  {key.hint} · {key.scopes.join(", ")} ·{" "}
                  {key.lastUsedAt
                    ? `использован ${new Date(key.lastUsedAt).toLocaleDateString("ru-RU")}`
                    : "ещё не использован"}
                </span>
              </span>
              {!key.revoked && (
                <Button
                  type="button"
                  variant="danger"
                  size="sm"
                  disabled={pending}
                  onClick={() => void revoke(key.id)}
                >
                  Отозвать
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
