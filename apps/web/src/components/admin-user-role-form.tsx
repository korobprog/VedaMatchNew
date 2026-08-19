"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import type { Role } from "@vedamatch/shared";
import { roleLabels } from "@/lib/admin-labels";
import { apiFetch } from "@/lib/http-client";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const roles: Role[] = ["user", "admin", "service-admin"];

export function AdminUserRoleForm({
  userId,
  isSelf,
  initialRole,
}: {
  userId: string;
  isSelf: boolean;
  initialRole: Role;
}) {
  const router = useRouter();
  const [role, setRole] = useState<Role>(initialRole);
  const [confirmSelfChange, setConfirmSelfChange] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (role === initialRole) return;

    setPending(true);
    try {
      const res = await apiFetch(`${API_URL}/admin/users/${userId}/role`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role, confirmSelfChange }),
      });
      if (!res.ok) throw new Error(await res.text());
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось сохранить изменение");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-2xl border border-magenta/30 bg-magenta/5 p-4">
      <h3 className="font-semibold text-text-0">Роль пользователя</h3>
      {error && <Alert tone="error">{error}</Alert>}
      <label className="block text-sm font-medium text-text-1">
        Роль
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as Role)}
          className="mt-1 w-full rounded-xl border border-glass-brd bg-bg-0 px-3 py-2 text-text-0"
        >
          {roles.map((item) => (
            <option key={item} value={item}>{roleLabels[item]}</option>
          ))}
        </select>
      </label>
      {isSelf && role !== initialRole && (
        <label className="flex gap-2 text-sm text-red-600 dark:text-red-300">
          <input
            type="checkbox"
            checked={confirmSelfChange}
            onChange={(e) => setConfirmSelfChange(e.target.checked)}
          />
          Я понимаю, что меняю роль собственного аккаунта.
        </label>
      )}
      <Button
        type="submit"
        loading={pending}
        disabled={role === initialRole || (isSelf && !confirmSelfChange)}
      >
        {pending ? "Сохраняем…" : "Сохранить роль"}
      </Button>
    </form>
  );
}
