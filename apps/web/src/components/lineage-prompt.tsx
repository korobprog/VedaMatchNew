"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  needsLineageChoice,
  type LineageId,
  type LineageViewer,
} from "@vedamatch/shared";
import { apiFetch } from "@/lib/http-client";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { LineageCards } from "./lineage-picker";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

/**
 * Предложение выбрать духовную линию — преданному, у которого она ещё не
 * указана. Показывается на входе в сервис с контентом по линиям (Образование,
 * Музыка): возможность появилась позже анкеты, и у старых аккаунтов поле
 * пусто, а без него сервис показывает всё подряд.
 *
 * Пишет в портальный профиль (`PATCH /profile`), а не в настройки сервиса:
 * линия одна на человека, и выбранная в Музыке обязана действовать и в
 * Образовании. Своя настройка у сервиса тоже есть — про неё говорит подсказка
 * после сохранения, и живёт она на странице настроек сервиса.
 *
 * Не-преданным не показывается вовсе: к ним деление на линии не относится.
 */
export function LineagePrompt({
  user,
  serviceName,
  settingsHref,
  settingsLabel = "в настройках сервиса",
}: {
  user: LineageViewer;
  /** В родительном падеже: «Образования», «Музыки». */
  serviceName: string;
  /** Куда идти, чтобы позже выбрать в этом сервисе другую линию. */
  settingsHref: string;
  settingsLabel?: string;
}) {
  const router = useRouter();
  const [lineage, setLineage] = useState<LineageId | "">("");
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!needsLineageChoice(user) && !saved) return null;

  async function save() {
    if (!lineage) return;
    setPending(true);
    setError(null);
    try {
      const res = await apiFetch(`${API_URL}/profile`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ lineage }),
      });
      if (!res.ok) throw new Error(await res.text());
      setSaved(true);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось сохранить");
    } finally {
      setPending(false);
    }
  }

  if (saved) {
    return (
      <Alert tone="success" className="mb-6">
        Линия сохранена. Другую для {serviceName} можно выбрать{" "}
        <Link href={settingsHref} className="underline">
          {settingsLabel}
        </Link>
        , в целом — в профиле.
      </Alert>
    );
  }

  return (
    <section
      aria-labelledby="lineage-prompt-title"
      className="glass mb-6 rounded-2xl border border-gold/40 bg-gold/10 p-5"
    >
      <h2
        id="lineage-prompt-title"
        className="font-display text-lg font-semibold text-text-0"
      >
        К какой линии вы принадлежите?
      </h2>
      <p className="mt-1 mb-4 text-sm text-text-1">
        Вы указали, что вы преданный. Выберите своё общество, матх или
        паривар — и материалы {serviceName} будут подбираться под вашу
        традицию, без чужого. Изменить выбор можно в любой момент в профиле, а
        для одного этого сервиса — {settingsLabel}.
      </p>

      <LineageCards value={lineage} onChange={setLineage} disabled={pending} />

      {error && (
        <Alert tone="error" className="mt-4">
          {error}
        </Alert>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button onClick={save} loading={pending} disabled={!lineage}>
          {pending ? "Сохраняем..." : "Сохранить"}
        </Button>
        <span className="text-xs text-text-2">
          Пока линия не выбрана, показывается всё подряд.
        </span>
      </div>
    </section>
  );
}
