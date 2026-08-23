"use client";

import { useState } from "react";
import type { ChatColorTemplateDto, SaveChatColorTemplateRequest } from "@vedamatch/shared";
import {
  createColorTemplate,
  deleteColorTemplate,
  updateColorTemplate,
} from "@/lib/chat-appearance-api";

const DEFAULT_DRAFT: SaveChatColorTemplateRequest = {
  name: "",
  bubbleMine: "#23F0C7",
  bubbleTheirs: "#1A1A2E",
  accent: "#5CCCCC",
  background: "#0A0614",
};

/**
 * Готовые цвета вместо свободного hex-ввода: клик сразу ставит цвет, без
 * набора кода. Одна и та же карта на все четыре роли (пузырь свой/чужой,
 * акцент, фон) — нейтральные тона и фирменные цвета сервиса вперемешку,
 * потому что заранее не знать, для чего именно готовят цвет каждый раз.
 */
const COLOR_SWATCHES = [
  "#FFFFFF",
  "#F5F5F5",
  "#D0D0D0",
  "#8A8A8A",
  "#4A4A4A",
  "#1A1A2E",
  "#0A0614",
  "#23F0C7",
  "#33CCCC",
  "#5CCCCC",
  "#FF3E9E",
  "#FFC85C",
  "#B23EFF",
  "#FF6B6B",
  "#4ADE80",
  "#60A5FA",
];

/**
 * «Мои шаблоны оформления»: список именованных шаблонов цвета переписки,
 * создание/редактирование/удаление. Применение к конкретной беседе живёт
 * в меню беседы (chat-room-menu.tsx), не здесь.
 */
export function ChatAppearanceView({
  initialTemplates,
}: {
  initialTemplates: ChatColorTemplateDto[];
}) {
  const [templates, setTemplates] = useState(initialTemplates);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<SaveChatColorTemplateRequest>(DEFAULT_DRAFT);
  const [busy, setBusy] = useState(false);

  function startCreate() {
    setDraft(DEFAULT_DRAFT);
    setCreating(true);
    setEditingId(null);
  }

  function startEdit(template: ChatColorTemplateDto) {
    setDraft({
      name: template.name,
      bubbleMine: template.bubbleMine,
      bubbleTheirs: template.bubbleTheirs,
      accent: template.accent,
      background: template.background,
    });
    setEditingId(template.id);
    setCreating(false);
  }

  async function save() {
    setBusy(true);
    try {
      if (editingId) {
        const updated = await updateColorTemplate(editingId, draft);
        setTemplates((current) =>
          current.map((t) => (t.id === editingId ? updated : t)),
        );
      } else {
        const created = await createColorTemplate(draft);
        setTemplates((current) => [...current, created]);
      }
      setCreating(false);
      setEditingId(null);
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setBusy(true);
    try {
      await deleteColorTemplate(id);
      setTemplates((current) => current.filter((t) => t.id !== id));
    } finally {
      setBusy(false);
    }
  }

  const formOpen = creating || editingId !== null;

  return (
    <div className="flex flex-col gap-4">
      {templates.length === 0 && !formOpen && (
        <p className="text-sm text-text-2">
          Пока нет шаблонов оформления — создайте первый.
        </p>
      )}

      {!formOpen && (
        <button
          type="button"
          onClick={startCreate}
          className="self-start rounded-xl border border-cyan/34 px-4 py-2 text-sm font-semibold text-cyan"
        >
          Создать
        </button>
      )}

      {formOpen && (
        <div className="flex flex-col gap-3 rounded-2xl border border-glass-brd bg-glass p-4">
          <label className="flex flex-col gap-1 text-sm text-text-1">
            Название
            <input
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              className="rounded-lg border border-glass-brd bg-bg-1 px-3 py-2 text-text-0"
            />
          </label>

          <ColorField
            label="Пузырь своих сообщений"
            value={draft.bubbleMine}
            onChange={(v) => setDraft({ ...draft, bubbleMine: v })}
          />
          <ColorField
            label="Пузырь чужих сообщений"
            value={draft.bubbleTheirs}
            onChange={(v) => setDraft({ ...draft, bubbleTheirs: v })}
          />
          <ColorField
            label="Акцентный цвет"
            value={draft.accent}
            onChange={(v) => setDraft({ ...draft, accent: v })}
          />
          <ColorField
            label="Фон переписки"
            value={draft.background}
            onChange={(v) => setDraft({ ...draft, background: v })}
          />

          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy || !draft.name.trim()}
              onClick={() => void save()}
              className="rounded-xl bg-cyan px-4 py-2 text-sm font-semibold text-on-cyan disabled:opacity-60"
            >
              Сохранить
            </button>
            <button
              type="button"
              onClick={() => {
                setCreating(false);
                setEditingId(null);
              }}
              className="rounded-xl px-4 py-2 text-sm text-text-1"
            >
              Отмена
            </button>
          </div>
        </div>
      )}

      <ul className="flex flex-col gap-2">
        {templates.map((template) => (
          <li
            key={template.id}
            className="flex items-center gap-3 rounded-2xl border border-glass-brd bg-glass p-3"
          >
            <span className="flex gap-1">
              <Swatch color={template.bubbleMine} />
              <Swatch color={template.bubbleTheirs} />
              <Swatch color={template.accent} />
              <Swatch color={template.background} />
            </span>
            <span className="flex-1 text-sm font-semibold text-text-0">
              {template.name}
            </span>
            <button
              type="button"
              onClick={() => startEdit(template)}
              className="rounded-lg px-2 py-1 text-xs text-text-1 hover:text-text-0"
            >
              Изменить
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void remove(template.id)}
              className="rounded-lg px-2 py-1 text-xs text-magenta"
            >
              Удалить
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <fieldset className="flex flex-col gap-2 text-sm text-text-1">
      <legend className="mb-1">{label}</legend>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={label}>
        {COLOR_SWATCHES.map((color) => {
          const selected = color.toLowerCase() === value.toLowerCase();
          return (
            <button
              key={color}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={color}
              onClick={() => onChange(color)}
              style={{ backgroundColor: color }}
              className={`size-8 shrink-0 rounded-full border-2 transition-transform ${
                selected
                  ? "scale-110 border-cyan"
                  : "border-glass-brd hover:scale-105"
              }`}
            />
          );
        })}
      </div>
    </fieldset>
  );
}

function Swatch({ color }: { color: string }) {
  return (
    <span
      className="size-6 rounded-full border border-glass-brd"
      style={{ backgroundColor: color }}
      aria-hidden
    />
  );
}
