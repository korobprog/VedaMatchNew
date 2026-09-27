"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { UserRound, Users } from "lucide-react";
import type { SpiritualStage } from "@vedamatch/shared";
import { apiFetch } from "@/lib/http-client";
import { apiBase } from "@/lib/api-base";
import { stageScopeTitle } from "@/lib/audience-stages";

const API_URL = apiBase();

/**
 * Переключатель «Моя ступень / Все ступени» на главной (VED-575).
 *
 * Образование и Медиатека показывают человеку материалы его ступени
 * самоидентификации и материалы «для всех». Эта кнопка открывает и
 * размеченное для других ступеней — сразу во всех сервисах.
 *
 * Выбор хранится в портальном профиле (`User.showAllStages`, `PATCH
 * /profile`), а не в браузере: фильтр применяет сервер, и решение, известное
 * только браузеру, до ленты бы не дошло — ни в SSR, ни в приложении.
 *
 * Значок — один человек («моя ступень») или группа («все ступени»): состояние
 * видно без подписи, а место в ряду настроек над сеткой узкое. Имя кнопки
 * постоянное, состояние передаёт `aria-pressed`; подробности — в подсказке.
 * Без самоидентификации кнопки нет: такой человек и так видит всё.
 */
export function StageScopeToggle({
  stage,
  showAll: initialShowAll,
}: {
  stage: SpiritualStage | null;
  showAll: boolean;
}) {
  const router = useRouter();
  const [showAll, setShowAll] = useState(initialShowAll);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  const [refreshing, startTransition] = useTransition();

  if (!stage) return null;

  async function toggle() {
    const next = !showAll;
    setError(false);
    setSaving(true);
    setShowAll(next);
    try {
      const res = await apiFetch(`${API_URL}/profile`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ showAllStages: next }),
      });
      if (!res.ok) throw new Error(await res.text());
      // Карточки главной (свежий материал Образования) собраны на сервере с
      // прежним фильтром — перечитываем.
      startTransition(() => router.refresh());
    } catch {
      setShowAll(!next);
      setError(true);
    } finally {
      setSaving(false);
    }
  }

  const title = error
    ? "Не удалось переключить. Попробуйте ещё раз"
    : stageScopeTitle(stage, showAll);
  const Icon = showAll ? Users : UserRound;

  return (
    <button
      type="button"
      onClick={() => void toggle()}
      disabled={saving || refreshing}
      aria-pressed={showAll}
      aria-label="Материалы всех ступеней"
      /* Подсказка договаривает, что видно сейчас: «Йог и для всех» или всё. */
      title={title}
      aria-describedby={error ? "stage-scope-error" : undefined}
      /* Размер и рамка — как у соседней «Изменить порядок», нажатое
         состояние — тем же cyan, что у неё в режиме перестановки. */
      className={`relative flex min-h-8 min-w-8 items-center justify-center rounded-xl border px-2 py-1.5 transition-colors disabled:opacity-60 ${
        error
          ? "border-magenta/60 text-magenta"
          : showAll
            ? "border-cyan/40 bg-cyan/10 text-cyan"
            : "border-glass-brd text-text-2 hover:text-text-0"
      }`}
    >
      <Icon aria-hidden className="size-4" />
      {error && (
        <span id="stage-scope-error" className="sr-only">
          Не удалось переключить
        </span>
      )}
    </button>
  );
}
