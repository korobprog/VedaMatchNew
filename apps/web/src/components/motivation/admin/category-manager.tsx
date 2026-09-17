"use client";

import { useState } from "react";
import { CornerDownRight, Star } from "lucide-react";
import type {
  MotivationCategoryDto,
  MotivationCategoryFeed,
} from "@vedamatch/shared";
import { LoadFailure } from "./load-failure";
import { useAdminCommand } from "./use-admin-command";
import {
  cardClass,
  dangerButton,
  fieldClass,
  primaryButton,
  secondaryButton,
} from "./ui";

/**
 * В меню какой ленты стоит категория (VED-139). «Обе» — общая: она видна в
 * меню той ленты, где в ней что-то есть, а пустая — в обоих.
 */
const FEED_OPTIONS: { value: MotivationCategoryFeed; label: string }[] = [
  { value: "both", label: "Обе ленты" },
  { value: "art", label: "Для вас" },
  { value: "cards", label: "Открытки" },
];

function FeedSelect({
  value,
  label,
  disabled,
  onChange,
}: {
  value: MotivationCategoryFeed;
  label: string;
  disabled?: boolean;
  onChange: (feed: MotivationCategoryFeed) => void;
}) {
  return (
    <select
      value={value}
      disabled={disabled}
      aria-label={label}
      onChange={(event) =>
        onChange(event.target.value as MotivationCategoryFeed)
      }
      className={`${fieldClass} sm:w-auto`}
    >
      {FEED_OPTIONS.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

function AddForm({
  parentId,
  placeholder,
  pending,
  initialFeed = "both",
  onSubmit,
}: {
  parentId: string | null;
  placeholder: string;
  pending: boolean;
  /** Подкатегория по умолчанию живёт в ленте родителя. */
  initialFeed?: MotivationCategoryFeed;
  onSubmit: (
    title: string,
    parentId: string | null,
    feed: MotivationCategoryFeed,
  ) => void;
}) {
  const [title, setTitle] = useState("");
  const [feed, setFeed] = useState<MotivationCategoryFeed>(initialFeed);

  function submit() {
    const trimmed = title.trim();
    if (!trimmed) return;
    onSubmit(trimmed, parentId, feed);
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
      <FeedSelect
        value={feed}
        label={`Лента: ${placeholder}`}
        onChange={setFeed}
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
  onFeedChange,
}: {
  category: MotivationCategoryDto;
  isChild: boolean;
  pendingAction: string | undefined;
  error: string | undefined;
  onRename: (title: string) => void;
  onMakeDefault: () => void;
  onRemove: () => void;
  onFeedChange: (feed: MotivationCategoryFeed) => void;
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
                {category.slug} · для вас: {category.artCount ?? 0} ·
                открыток: {category.cardsCount ?? 0}
              </p>
            </div>
            <div className="flex w-full flex-wrap gap-2 sm:w-auto">
              <FeedSelect
                value={category.feed ?? "both"}
                label={`Лента категории «${category.title}»`}
                disabled={disabled}
                onChange={onFeedChange}
              />
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
  const create = (
    title: string,
    parentId: string | null,
    feed: MotivationCategoryFeed,
  ) =>
    run(parentId ? `sub:${parentId}` : "add", "add", {
      path: "/admin/motivation/categories",
      body: { title, parentId, feed },
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
      onFeedChange: (feed: MotivationCategoryFeed) =>
        run(category.id, "feed", {
          path: `/admin/motivation/categories/${category.id}`,
          method: "PATCH" as const,
          body: { feed },
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
      <p className="mt-1 text-sm text-text-2">
        У «Для вас» и «Открыток» свои меню категорий. Категория ленты стоит
        только в её меню, даже пустая. «Обе ленты» — общая: она видна там, где
        в ней что-то есть, а пустая — в обоих меню.
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
                    initialFeed={root.feed ?? "both"}
                    onSubmit={(title, parentId, feed) => {
                      void create(title, parentId, feed);
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
