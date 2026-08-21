"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { ADMIN_SERVICE_SLUGS } from "@vedamatch/shared";
import type { AdminServiceSlug, Role } from "@vedamatch/shared";
import { adminServiceLabels } from "@/lib/admin-labels";
import { apiFetch } from "@/lib/http-client";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

/**
 * Какими сервисами управляет администратор сервиса. Форма показывается только
 * у этой роли: у `admin` доступ и так полный, у обычного пользователя — никакой.
 */
export function AdminUserServicesForm({
  userId,
  role,
  initialServices,
}: {
  userId: string;
  role: Role;
  initialServices: string[];
}) {
  const router = useRouter();
  const [services, setServices] = useState<string[]>(initialServices);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  if (role !== "service-admin") return null;

  const changed =
    services.length !== initialServices.length ||
    services.some((slug) => !initialServices.includes(slug));

  function toggle(slug: AdminServiceSlug, checked: boolean) {
    setSaved(false);
    setServices((current) =>
      checked
        ? [...current, slug]
        : current.filter((item) => item !== slug),
    );
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);
    try {
      const res = await apiFetch(`${API_URL}/admin/users/${userId}/services`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ services }),
      });
      if (!res.ok) throw new Error(await res.text());
      setSaved(true);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось сохранить доступ");
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="space-y-4 rounded-2xl border border-magenta/30 bg-magenta/5 p-4"
    >
      <div>
        <h3 className="font-semibold text-text-0">Доступ к сервисам</h3>
        <p className="mt-1 text-sm text-text-1">
          Администратор сервиса управляет только отмеченными разделами.
          Портальные разделы — пользователи, поддержка, биллинг — ему недоступны.
        </p>
      </div>
      {error && <Alert tone="error">{error}</Alert>}
      {saved && !changed && <Alert tone="success">Доступ сохранён.</Alert>}
      <ul className="grid gap-2 sm:grid-cols-2">
        {ADMIN_SERVICE_SLUGS.map((slug) => (
          <li key={slug}>
            <label className="flex items-center gap-2 text-sm text-text-1">
              <input
                type="checkbox"
                checked={services.includes(slug)}
                onChange={(event) => toggle(slug, event.target.checked)}
              />
              {adminServiceLabels[slug]}
            </label>
          </li>
        ))}
      </ul>
      <Button type="submit" loading={pending} disabled={!changed}>
        {pending ? "Сохраняем…" : "Сохранить доступ"}
      </Button>
    </form>
  );
}
