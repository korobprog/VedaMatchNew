"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import {
  UNION_ADMIN_HIDE_REASON_MIN_LENGTH,
  type UnionAdminShowcaseState,
} from "@vedamatch/shared";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { blockUnionShowcase, unblockUnionShowcase } from "@/lib/union-admin-api";

/**
 * Публичная витрина Знакомств — страница сервиса, открытая гостям и
 * поисковикам. Отдельный рычаг от видимости в рекомендациях: снимок,
 * неуместный на лице сервиса, не обязательно повод убирать анкету изнутри
 * портала, и наоборот.
 *
 * Согласие человека это действие не снимает: он его давал, администрация
 * лишь придерживает показ.
 */
export function UnionProfileShowcaseForm({
  userId,
  showcase,
}: {
  userId: string;
  showcase: UnionAdminShowcaseState;
}) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<unknown>) {
    setPending(true);
    setError(null);
    try {
      await action();
      setReason("");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось изменить");
    } finally {
      setPending(false);
    }
  }

  async function block(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await run(() => blockUnionShowcase(userId, { reason: reason.trim() }));
  }

  if (showcase === "off") {
    return (
      <div className="space-y-2 rounded-2xl border border-glass-brd p-4">
        <h2 className="font-display font-semibold text-text-0">
          Публичная витрина
        </h2>
        <p className="text-sm text-text-1">
          Человек не давал согласия показывать анкету на публичной странице
          сервиса. Снимать с витрины нечего — включить согласие за него нельзя.
        </p>
      </div>
    );
  }

  if (showcase === "blocked") {
    return (
      <div className="space-y-3 rounded-2xl border border-gold/40 bg-gold/5 p-4">
        <h2 className="font-display font-semibold text-text-0">
          Публичная витрина
        </h2>
        <p className="text-sm text-text-1">
          Анкета снята с публичной страницы администрацией. Согласие человека
          сохранено — вернуть показ можно одной кнопкой.
        </p>
        {error && <Alert tone="error">{error}</Alert>}
        <Button
          type="button"
          loading={pending}
          onClick={() => void run(() => unblockUnionShowcase(userId))}
        >
          Вернуть на витрину
        </Button>
      </div>
    );
  }

  return (
    <form
      onSubmit={block}
      className="space-y-3 rounded-2xl border border-gold/40 bg-gold/5 p-4"
    >
      <div>
        <h2 className="font-display font-semibold text-text-0">
          Публичная витрина
        </h2>
        <p className="mt-1 text-sm text-text-1">
          Анкета показывается на публичной странице Знакомств — её видят гости
          и поисковики. Снятие не трогает ни саму анкету внутри портала, ни
          согласие человека.
        </p>
      </div>
      {error && <Alert tone="error">{error}</Alert>}
      <label className="block text-sm font-medium text-text-1">
        Причина
        <input
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="что не так для публичного показа"
          className="mt-1 w-full rounded-xl border border-glass-brd bg-bg-1 px-3 py-2 text-sm text-text-0 placeholder:text-text-2"
        />
      </label>
      <Button
        type="submit"
        loading={pending}
        disabled={reason.trim().length < UNION_ADMIN_HIDE_REASON_MIN_LENGTH}
      >
        Снять с витрины
      </Button>
    </form>
  );
}
