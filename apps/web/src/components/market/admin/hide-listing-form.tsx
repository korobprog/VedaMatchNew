"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/http-client";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

/**
 * Скрытие объявления без жалобы: у Рынка постмодерация, и наткнувшийся на
 * нарушение админ не должен ждать, пока кто-нибудь пожалуется. ID берётся из
 * адреса карточки объявления.
 */
export function HideListingForm() {
  const router = useRouter();
  const [listingId, setListingId] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hidden, setHidden] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const id = listingId.trim();
    if (!id) return;

    setPending(true);
    setError(null);
    setHidden(null);
    try {
      const res = await apiFetch(
        `${API_URL}/market/admin/listings/${encodeURIComponent(id)}/hide`,
        { method: "POST", credentials: "include" },
      );
      if (!res.ok) {
        setError(await res.text());
        return;
      }
      setHidden(id);
      setListingId("");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось скрыть объявление");
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="glass mt-8 space-y-3 rounded-2xl border border-glass-brd p-4"
    >
      <div>
        <h2 className="font-display font-semibold text-text-0">
          Скрыть объявление вручную
        </h2>
        <p className="mt-1 text-sm text-text-1">
          Без жалобы — когда нарушение нашли сами. ID есть в адресе карточки
          объявления.
        </p>
      </div>
      {error && <Alert tone="error">{error}</Alert>}
      {hidden && <Alert tone="success">Объявление {hidden} скрыто.</Alert>}
      <label className="block text-sm font-medium text-text-1">
        ID объявления
        <input
          value={listingId}
          onChange={(event) => setListingId(event.target.value)}
          placeholder="00000000-0000-0000-0000-000000000000"
          className="mt-1 w-full rounded-xl border border-glass-brd bg-bg-1 px-3 py-2 font-mono text-sm text-text-0 placeholder:text-text-2"
        />
      </label>
      <Button type="submit" loading={pending} disabled={!listingId.trim()}>
        Скрыть
      </Button>
    </form>
  );
}
