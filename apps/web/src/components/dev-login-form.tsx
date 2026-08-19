"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSafeReturnTo } from "@/lib/return-to";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

type DemoAccount = { email: string; name: string };

/**
 * Вход по логину и паролю для локальной отладки. Рендерится только когда
 * NEXT_PUBLIC_DEV_AUTH=true, а API дополнительно требует DEV_AUTH_ENABLED=true
 * и непроизводственный NODE_ENV.
 */
export function DevLoginForm({ returnTo }: { returnTo?: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [accounts, setAccounts] = useState<DemoAccount[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`${API_URL}/auth/dev-accounts`, { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : { accounts: [] }))
      .then((data: { accounts?: DemoAccount[] }) =>
        setAccounts(data.accounts ?? []),
      )
      .catch(() => setAccounts([]));
    return () => controller.abort();
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/auth/dev-login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password, returnTo }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json().catch(() => null)) as {
        returnTo?: string;
      } | null;
      router.push(getSafeReturnTo(data?.returnTo ?? returnTo));
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось войти");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-6 space-y-3 text-left">
      <div className="flex items-center gap-3">
        <span className="h-px flex-1 bg-glass-brd" />
        <span className="text-xs uppercase tracking-wide text-text-2">
          Dev-вход
        </span>
        <span className="h-px flex-1 bg-glass-brd" />
      </div>

      <label className="block">
        <span className="mb-1 block text-xs text-text-2">Email</span>
        <input
          type="email"
          autoComplete="username"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
          className="w-full rounded-xl border border-glass-brd bg-bg-1 px-3 py-2 text-sm text-text-0 outline-none focus:border-magenta/50"
        />
      </label>

      <label className="block">
        <span className="mb-1 block text-xs text-text-2">Пароль</span>
        <input
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
          className="w-full rounded-xl border border-glass-brd bg-bg-1 px-3 py-2 text-sm text-text-0 outline-none focus:border-magenta/50"
        />
      </label>

      {accounts.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {accounts.map((account) => (
            <button
              key={account.email}
              type="button"
              onClick={() => setEmail(account.email)}
              className="rounded-full border border-glass-brd px-2.5 py-1 text-xs text-text-1 transition hover:text-text-0"
            >
              {account.name}
            </button>
          ))}
        </div>
      )}

      {error && <p className="text-xs text-red-500">{error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-xl bg-gradient-to-r from-magenta to-[#B23EFF] py-3 text-sm font-semibold text-white transition hover:shadow-[0_0_20px_var(--vm-glow-magenta)] disabled:opacity-50"
      >
        {pending ? "Входим..." : "Войти по паролю"}
      </button>
    </form>
  );
}
