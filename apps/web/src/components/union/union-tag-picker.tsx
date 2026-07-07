"use client";

import { useMemo, useState } from "react";
import type { UnionTagOption } from "./dictionaries";

interface UnionTagPickerProps {
  label: string;
  selected: string[];
  options: UnionTagOption[];
  onChange: (values: string[]) => void;
  allowCustom?: boolean;
  placeholder?: string;
  helperText?: string;
}

export function UnionTagPicker({
  label,
  selected,
  options,
  onChange,
  allowCustom = true,
  placeholder = "Начните вводить для поиска",
  helperText,
}: UnionTagPickerProps) {
  const [query, setQuery] = useState("");
  const normalizedSelected = useMemo(
    () => new Set(selected.map(normalize)),
    [selected],
  );
  const filteredOptions = useMemo(() => {
    const needle = normalize(query);
    if (!needle) return options;
    return options.filter((option) => {
      const haystack = [option.label, option.value, option.category]
        .filter(Boolean)
        .join(" ");
      return normalize(haystack).includes(needle);
    });
  }, [options, query]);

  const groupedOptions = useMemo(() => {
    const groups = new Map<string, UnionTagOption[]>();
    for (const option of filteredOptions) {
      const key = option.category ?? "Популярные варианты";
      groups.set(key, [...(groups.get(key) ?? []), option]);
    }
    return [...groups.entries()];
  }, [filteredOptions]);

  const customValue = query.trim();
  const canAddCustom =
    allowCustom &&
    customValue.length > 0 &&
    customValue.length <= 100 &&
    !normalizedSelected.has(normalize(customValue)) &&
    !options.some((option) => normalize(option.value) === normalize(customValue));

  function add(value: string) {
    const cleaned = value.trim();
    if (!cleaned || normalizedSelected.has(normalize(cleaned))) return;
    onChange([...selected, cleaned]);
    setQuery("");
  }

  function remove(value: string) {
    const normalizedValue = normalize(value);
    onChange(selected.filter((item) => normalize(item) !== normalizedValue));
  }

  function toggle(value: string) {
    if (normalizedSelected.has(normalize(value))) {
      remove(value);
    } else {
      add(value);
    }
  }

  return (
    <section className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          {label}
        </h3>
        {helperText && <p className="mt-1 text-xs text-zinc-500">{helperText}</p>}
      </div>

      <div className="mb-3 flex flex-wrap gap-2">
        {selected.length > 0 ? (
          selected.map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => remove(value)}
              className="rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-900 transition hover:bg-amber-200 dark:bg-amber-900 dark:text-amber-100 dark:hover:bg-amber-800"
              aria-label={`Удалить ${value}`}
            >
              {value} ×
            </button>
          ))
        ) : (
          <p className="text-xs text-zinc-500">Пока ничего не выбрано</p>
        )}
      </div>

      <input
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        maxLength={100}
        placeholder={placeholder}
        className="mb-3 w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
      />

      <div className="space-y-3">
        {groupedOptions.length > 0 ? (
          groupedOptions.map(([group, groupOptions]) => (
            <div key={group}>
              {groupedOptions.length > 1 && (
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">
                  {group}
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                {groupOptions.map((option) => {
                  const active = normalizedSelected.has(normalize(option.value));
                  return (
                    <button
                      key={`${option.category ?? "default"}-${option.value}`}
                      type="button"
                      onClick={() => toggle(option.value)}
                      className={
                        active
                          ? "rounded-full bg-amber-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-amber-700"
                          : "rounded-full border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 transition hover:border-amber-500 hover:text-amber-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
                      }
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>
          ))
        ) : (
          <p className="text-xs text-zinc-500">Ничего не найдено</p>
        )}

        {canAddCustom && (
          <button
            type="button"
            onClick={() => add(customValue)}
            className="rounded-xl border border-dashed border-amber-500 px-3 py-2 text-xs font-medium text-amber-700 transition hover:bg-amber-50 dark:text-amber-300 dark:hover:bg-amber-950"
          >
            + Добавить “{customValue}”
          </button>
        )}
      </div>
    </section>
  );
}

function normalize(value: string | undefined): string {
  return (value ?? "").trim().toLocaleLowerCase("ru-RU");
}
