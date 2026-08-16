"use client";

import { useState } from "react";
import { CornerDownRight, Star } from "lucide-react";
import type { MotivationCategoryDto } from "@vedamatch/shared";
import { LoadFailure } from "./load-failure";
import { useAdminCommand } from "./use-admin-command";
import {
  cardClass,
  dangerButton,
  fieldClass,
  primaryButton,
  secondaryButton,
} from "./ui";

function AddForm({
  parentId,
  placeholder,
  pending,
  onSubmit,
}: {
  parentId: string | null;
  placeholder: string;
  pending: boolean;
  onSubmit: (title: string, parentId: string | null) => void;
}) {
  const [title, setTitle] = useState("");

  function submit() {
    const trimmed = title.trim();
    if (!trimmed) return;
    onSubmit(trimmed, parentId);
    setTitle("");
  }

  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      <input
        type="text"
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") submit();
        }}
        placeholder={placeholder}
        aria-label={placeholder}
        className={fieldClass}
      />
      <button
        type="button"
        disabled={pending || !title.trim()}
        onClick={submit}
        className={primaryButton}
      >
        {pending ? "Добавление…" : "Добавить"}
      </button>
    </div>
  );
}

function CategoryRow({
  category,
  isChild,
  pendingAction,
  error,
  onRename,
  onMakeDefault,
  onRemove,
}: {
  category: MotivationCategoryDto;
  isChild: boolean;
  pendingAction: string | undefined;
  error: string | undefined;
  onRename: (title: string) => void;
  onMakeDefault: () => void;
  onRemove: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(category.title);
  const disabled = pendingAction !== undefined;

  return (
    <li className={isChild ? "ml-5 border-l border-glass-brd pl-4" : ""}>
      <div className="rounded-xl bg-glass p-3">
        {editing ? (
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              type="text"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              aria-label={`Название категории «${category.title}»`}
              className={fieldClass}
            />
            <button
              type="button"
              disabled={disabled || !title.trim()}
              onClick={() => {
                onRename(title.trim());
                setEditing(false);
              }}
              className={primaryButton}
            >
              Сохранить
            </button>
            <button
              type="button"
              onClick={() => {
                setTitle(category.title);
                setEditing(false);
              }}
              className={secondaryButton}
            >
              Отмена
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1.5 font-medium text-text-0">
                {isChild && (
                  <CornerDownRight className="h-4 w-4 shrink-0 text-text-2" />
                )}
                <span className="truncate">{category.title}</span>
                {category.isDefault && (
                  <span
                    title="Категория по умолчанию"
                    className="inline-flex items-center gap-1 rounded-full bg-gold/20 px-2 py-0.5 text-[11px] font-semibold text-gold"
                  >
                    <Star className="h-3 w-3" />
                    по умолчанию
                  </span>
                )}
              </p>
              <p className="truncate text-xs text-text-2">
                {category.slug} · публикаций: {category.postCount}
              </p>
            </div>
            <div className="flex w-full gap-2 sm:w-auto">
              <button
                type="button"
                disabled={disabled}
                onClick={() => setEditing(true)}
                className={secondaryButton}
              >
                Переименовать
              </button>
              {!category.isDefault && (
                <>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={onMakeDefault}
                    className={secondaryButton}
                  >
                    {pendingAction === "default" ? "…" : "Сделать основной"}
                  </button>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={onRemove}
                    className={dangerButton}
                  >
                    Удалить
                  </button>
                </>
              )}
            </div>
          </div>
        )}
        {error && (
          <p role="alert" className="mt-2 text-sm font-medium text-red-500">
            {error}
          </p>
        )}
      </div>
    </li>
  );
}

export function CategoryManager({
  categories,
}: {
  categories: MotivationCategoryDto[] | null;
}) {
  const { pending, errors, run } = useAdminCommand();
  const [openParent, setOpenParent] = useState<string | null>(null);

  if (!categories) return <LoadFailure what="категории" />;

  // Ключ формы подкатегории отличается от id родителя: иначе ошибка добавления
  // всплыла бы на самой строке родителя, у которой свои действия.
  const create = (title: string, parentId: string | null) =>
    run(parentId ? `sub:${parentId}` : "add", "add", {
      path: "/admin/motivation/categories",
      body: { title, parentId },
    });

  const roots = categories.filter((category) => !category.parentId);
  const childrenOf = (parentId: string) =>
    categories.filter((category) => category.parentId === parentId);

  function rowProps(category: MotivationCategoryDto) {
    return {
      pendingAction: pending[category.id],
      error: errors[category.id],
      onRename: (title: string) =>
        run(category.id, "rename", {
          path: `/admin/motivation/categories/${category.id}`,
          method: "PATCH" as const,
          body: { title },
        }),
      onMakeDefault: () =>
        run(category.id, "default", {
          path: `/admin/motivation/categories/${category.id}`,
          method: "PATCH" as const,
          body: { isDefault: true },
        }),
      onRemove: () =>
        run(category.id, "remove", {
          path: `/admin/motivation/categories/${category.id}`,
          method: "DELETE" as const,
        }),
    };
  }

  return (
    <div className={cardClass}>
      <h2 className="text-lg font-semibold text-text-0">Категории</h2>
      <p className="mt-1 text-sm text-text-2">
        Категория по умолчанию достаётся новым цитатам. Её нельзя удалить — сначала
        назначьте основной другую. Вложенность — на один уровень.
      </p>

      <div className="mt-4">
        <AddForm
          parentId={null}
          placeholder="Название категории, например: Смирение"
          pending={pending.add === "add"}
          onSubmit={create}
        />
        {errors.add && (
          <p role="alert" className="mt-2 text-sm font-medium text-red-500">
            {errors.add}
          </p>
        )}
      </div>

      <ul className="mt-4 space-y-2">
        {roots.length === 0 && (
          <li className="rounded-xl border border-dashed border-glass-brd p-4 text-center text-sm text-text-2">
            Справочник пуст.
          </li>
        )}
        {roots.map((root) => (
          <li key={root.id} className="space-y-2">
            <ul>
              <CategoryRow category={root} isChild={false} {...rowProps(root)} />
            </ul>
            <ul className="space-y-2">
              {childrenOf(root.id).map((child) => (
                <CategoryRow key={child.id} category={child} isChild {...rowProps(child)} />
              ))}
            </ul>
            <div className="ml-5 pl-4">
              {openParent === root.id ? (
                <>
                  <AddForm
                    parentId={root.id}
                    placeholder={`Подкатегория в «${root.title}»`}
                    pending={pending[`sub:${root.id}`] === "add"}
                    onSubmit={(title, parentId) => {
                      void create(title, parentId);
                      setOpenParent(null);
                    }}
                  />
                  {errors[`sub:${root.id}`] && (
                    <p role="alert" className="mt-2 text-sm font-medium text-red-500">
                      {errors[`sub:${root.id}`]}
                    </p>
                  )}
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setOpenParent(root.id)}
                  className="text-sm font-medium text-cyan hover:underline"
                >
                  + Подкатегория
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
