"use client";

import { useCallback, useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Funnel } from "lucide-react";
import {
  AUDIENCE_STAGES,
  AUDIENCE_STAGE_LABELS,
  lineagesByGroup,
  type MaterialFilters,
  type MaterialFiltersState,
  type SpiritualStage,
  type UserProfile,
} from "@vedamatch/shared";
import { Button } from "@/components/ui/button";
import { AnchoredPopover } from "@/components/anchored-popover";
import { useDismissable } from "@/lib/use-dismissable";
import { apiFetch } from "@/lib/http-client";
import { apiBase } from "@/lib/api-base";
import { toggleAudienceStage } from "@/lib/audience-stages";
import {
  lineageGroupState,
  materialFiltersActive,
  materialFiltersButtonLabel,
  sameMaterialFilters,
  toggleLineage,
  toggleLineageGroup,
} from "@/lib/material-filters";

const API_URL = apiBase();

/**
 * Кнопка-значок «Фильтры материалов» на главной (VED-617): какие материалы
 * Образования и Медиатеки человек видит на всём портале. Два раздела с
 * мультивыбором — по самоидентификации и по духовной линии; «Все» в каждом.
 * Материалы без разметки видны при любом выборе.
 *
 * Пока фильтры не трогали, они по анкете: своя ступень и своя линия у
 * преданного. Выбор руками решает дальше, анкета при этом не меняется —
 * «По анкете» возвращает фильтры к ней.
 *
 * Хранится в портальном профиле (`PATCH /profile`, `materialFilters`), а не
 * в браузере: фильтр применяет сервер, и выбор, известный только браузеру,
 * до ленты не дошёл бы — ни в SSR, ни в приложении. Заменила переключатель
 * «Моя ступень / Все ступени» (VED-575): тот был частным случаем этого окна.
 */
export function MaterialFiltersButton({
  initial,
  stage,
}: {
  initial: MaterialFiltersState;
  /** Ступень из анкеты — подписью «ваша» у своей строки. */
  stage: SpiritualStage | null;
}) {
  const router = useRouter();
  const [saved, setSaved] = useState<MaterialFiltersState>(initial);
  const [draft, setDraft] = useState<MaterialFilters>(initial);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, startTransition] = useTransition();
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  const close = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);
  useDismissable(panelRef, close, open, triggerRef);

  const label = materialFiltersButtonLabel(saved);
  const active = materialFiltersActive(saved);

  async function save(next: MaterialFilters | null) {
    setError(null);
    if (next && saved.custom && sameMaterialFilters(next, saved)) {
      close();
      return;
    }
    setPending(true);
    try {
      const res = await apiFetch(`${API_URL}/profile`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ materialFilters: next }),
      });
      if (!res.ok) throw new Error(await res.text());
      const profile = (await res.json()) as UserProfile;
      if (profile.materialFilters) setSaved(profile.materialFilters);
      close();
      // Карточки главной (свежий материал Образования) собраны на сервере с
      // прежним фильтром — перечитываем.
      startTransition(() => router.refresh());
    } catch {
      setError("Не удалось сохранить фильтры");
    } finally {
      setPending(false);
    }
  }

  const rowClass = (checked: boolean) =>
    `flex min-h-11 w-full cursor-pointer items-center gap-3 rounded-xl px-3 text-left text-sm transition-colors ${
      checked
        ? "bg-magenta/10 font-semibold text-text-0"
        : "text-text-1 hover:bg-bg-1 hover:text-text-0"
    }`;
  const boxClass = "size-4 shrink-0 accent-magenta";

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        id="material-filters"
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-label={label}
        title={label}
        disabled={refreshing}
        onClick={() => {
          if (!open) {
            setDraft({
              stages: [...saved.stages],
              lineages: [...saved.lineages],
            });
            setError(null);
          }
          setOpen(!open);
        }}
        /* Размер и рамка — как у соседних кнопок ряда; сужающие фильтры —
           тем же cyan, что нажатое состояние соседей. */
        className={`relative flex min-h-8 min-w-8 scroll-mt-24 items-center justify-center rounded-xl border px-2 py-1.5 transition-colors disabled:opacity-60 ${
          active
            ? "border-cyan/40 bg-cyan/10 text-cyan"
            : "border-glass-brd text-text-2 hover:text-text-0"
        }`}
      >
        <Funnel aria-hidden className="size-4" />
      </button>
      {open && (
        <AnchoredPopover
          anchorRef={triggerRef}
          panelRef={panelRef}
          width={560}
          align="end"
          id={panelId}
          role="group"
          aria-label="Фильтры материалов"
          aria-busy={pending}
        >
          <p className="px-3 pb-2 pt-1 text-xs text-text-1">
            Какие материалы показывать в Образовании и Медиатеке. Можно отметить
            несколько вариантов или все. Материалы без разметки видны всегда.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <fieldset className="min-w-0">
              <legend className="px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-text-2">
                По самоидентификации
              </legend>
              <label className={rowClass(draft.stages.length === 0)}>
                <input
                  type="checkbox"
                  className={boxClass}
                  checked={draft.stages.length === 0}
                  disabled={pending}
                  onChange={() => setDraft((d) => ({ ...d, stages: [] }))}
                />
                Все ступени
              </label>
              {AUDIENCE_STAGES.map((item) => {
                const checked = draft.stages.includes(item);
                return (
                  <label key={item} className={rowClass(checked)}>
                    <input
                      type="checkbox"
                      className={boxClass}
                      checked={checked}
                      disabled={pending}
                      onChange={() =>
                        setDraft((d) => ({
                          ...d,
                          stages: toggleAudienceStage(d.stages, item),
                        }))
                      }
                    />
                    <span className="min-w-0 flex-1">
                      {AUDIENCE_STAGE_LABELS[item]}
                      {item === stage && (
                        <span className="font-normal text-text-2"> · ваша</span>
                      )}
                    </span>
                  </label>
                );
              })}
            </fieldset>
            <fieldset className="min-w-0">
              <legend className="px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-text-2">
                По духовной линии
              </legend>
              <label className={rowClass(draft.lineages.length === 0)}>
                <input
                  type="checkbox"
                  className={boxClass}
                  checked={draft.lineages.length === 0}
                  disabled={pending}
                  onChange={() => setDraft((d) => ({ ...d, lineages: [] }))}
                />
                Все линии
              </label>
              {lineagesByGroup().map(({ group, label: groupLabel, items }) => {
                // Группа из одной линии (ISKCON) — одной строкой.
                if (items.length === 1) {
                  const id = items[0].id;
                  const checked = draft.lineages.includes(id);
                  return (
                    <label key={group} className={rowClass(checked)}>
                      <input
                        type="checkbox"
                        className={boxClass}
                        checked={checked}
                        disabled={pending}
                        onChange={() =>
                          setDraft((d) => ({
                            ...d,
                            lineages: toggleLineage(d.lineages, id),
                          }))
                        }
                      />
                      {groupLabel}
                    </label>
                  );
                }
                const state = lineageGroupState(draft.lineages, group);
                return (
                  <div key={group}>
                    <label className={rowClass(state === "all")}>
                      <input
                        type="checkbox"
                        className={boxClass}
                        checked={state === "all"}
                        ref={(node) => {
                          if (node) node.indeterminate = state === "some";
                        }}
                        disabled={pending}
                        onChange={() =>
                          setDraft((d) => ({
                            ...d,
                            lineages: toggleLineageGroup(d.lineages, group),
                          }))
                        }
                      />
                      {groupLabel}
                    </label>
                    <div
                      role="group"
                      aria-label={groupLabel}
                      className="ml-3 border-l border-glass-brd pl-2"
                    >
                      {items.map((item) => {
                        const checked = draft.lineages.includes(item.id);
                        return (
                          <label key={item.id} className={rowClass(checked)}>
                            <input
                              type="checkbox"
                              className={boxClass}
                              checked={checked}
                              disabled={pending}
                              onChange={() =>
                                setDraft((d) => ({
                                  ...d,
                                  lineages: toggleLineage(d.lineages, item.id),
                                }))
                              }
                            />
                            {item.label}
                          </label>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </fieldset>
          </div>
          <div className="mt-2 flex gap-2 border-t border-glass-brd px-1 pt-2">
            {/* Вернуть фильтры по анкете — только когда их меняли руками. */}
            {saved.custom && (
              <button
                type="button"
                disabled={pending}
                onClick={() => void save(null)}
                className="inline-flex min-h-11 flex-1 items-center justify-center rounded-xl border border-glass-brd px-3 text-sm text-text-1 transition-colors hover:text-text-0 disabled:opacity-50"
              >
                По анкете
              </button>
            )}
            <Button
              type="button"
              loading={pending}
              onClick={() => void save(draft)}
              className="min-h-11 flex-1"
            >
              Сохранить
            </Button>
          </div>
          {error && (
            <p role="alert" className="px-3 pt-2 text-xs text-magenta">
              {error}
            </p>
          )}
        </AnchoredPopover>
      )}
    </div>
  );
}
