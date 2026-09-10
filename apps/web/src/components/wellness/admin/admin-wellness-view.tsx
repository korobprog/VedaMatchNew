"use client";

import { useCallback, useEffect, useState } from "react";
import {
  WELLNESS_INGREDIENT_CLASSES,
  type WellnessIngredientClass,
  type WellnessIngredientDto,
} from "@vedamatch/shared";
import {
  approveWellnessProduct,
  deleteWellnessRecipe,
  getAdminWellnessRecipes,
  importWellnessRecipes,
  setWellnessRecipeStatus,
  decideWellnessReport,
  deleteWellnessIngredient,
  getAdminWellnessIngredients,
  getAdminWellnessProducts,
  getAdminWellnessReports,
  rejectWellnessProduct,
  saveWellnessIngredient,
  type AdminWellnessProduct,
  type AdminWellnessRecipe,
  type AdminWellnessReport,
} from "@/lib/wellness-admin-api";
import { ingredientClassLabel } from "@/components/wellness/verdict-labels";

type Tab = "queue" | "reports" | "catalog" | "recipes";

/**
 * Админка сервиса. Справочник здесь главный: пока в нём нет алиаса, сканер
 * этого ингредиента не найдёт — и это единственный способ такое починить.
 */
export function AdminWellnessView() {
  const [tab, setTab] = useState<Tab>("queue");

  return (
    <div className="mt-6 space-y-6">
      <div role="tablist" className="flex flex-wrap gap-2">
        <TabButton active={tab === "queue"} onClick={() => setTab("queue")}>
          Очередь продуктов
        </TabButton>
        <TabButton active={tab === "reports"} onClick={() => setTab("reports")}>
          Жалобы на состав
        </TabButton>
        <TabButton active={tab === "catalog"} onClick={() => setTab("catalog")}>
          Справочник
        </TabButton>
        <TabButton active={tab === "recipes"} onClick={() => setTab("recipes")}>
          Рецепты
        </TabButton>
      </div>

      {tab === "queue" && <QueueTab />}
      {tab === "reports" && <ReportsTab />}
      {tab === "catalog" && <CatalogTab />}
      {tab === "recipes" && <RecipesTab />}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`rounded-xl border px-3 py-2 text-sm ${
        active ? "border-magenta text-text-0" : "border-glass-brd text-text-1"
      }`}
    >
      {children}
    </button>
  );
}

function QueueTab() {
  const [items, setItems] = useState<AdminWellnessProduct[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    getAdminWellnessProducts("draft")
      .then(setItems)
      .catch((cause: Error) => setError(cause.message));
  }, []);

  useEffect(load, [load]);

  if (error) return <Alert text={error} />;
  if (!items) return <Loading />;
  if (!items.length)
    return <p className="text-sm text-text-1">Очередь пуста.</p>;

  return (
    <ul className="space-y-3">
      {items.map((item) => (
        <li
          key={item.id}
          className="rounded-2xl border border-glass-brd bg-glass p-4"
        >
          <p className="font-display text-lg font-bold text-text-0">
            {item.name}
          </p>
          <p className="font-mono text-xs text-text-2">{item.barcode}</p>
          {item.brand && <p className="text-sm text-text-1">{item.brand}</p>}
          <p className="mt-2 text-sm text-text-1">{item.ingredientsRaw}</p>

          {item.ingredients.length > 0 && (
            <p className="mt-2 text-xs text-text-2">
              Разобрано:{" "}
              {item.ingredients
                .map((row) => `${row.ingredient.nameRu} (${row.matchedText})`)
                .join(", ")}
            </p>
          )}
          <p className="mt-1 text-xs text-text-2">
            Прислал: {item.addedBy?.name ?? "неизвестно"} ·{" "}
            {new Date(item.createdAt).toLocaleDateString("ru-RU")}
          </p>

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                void approveWellnessProduct(item.id).then(load);
              }}
              className="rounded-xl bg-magenta px-4 py-2 text-sm font-medium text-bg-0"
            >
              Опубликовать
            </button>
            <button
              type="button"
              onClick={() => {
                const reason = window.prompt("Причина отказа");
                if (reason?.trim()) {
                  void rejectWellnessProduct(item.id, reason).then(load);
                }
              }}
              className="rounded-xl border border-glass-brd px-4 py-2 text-sm text-text-0"
            >
              Отклонить
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}

function ReportsTab() {
  const [items, setItems] = useState<AdminWellnessReport[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    getAdminWellnessReports()
      .then(setItems)
      .catch((cause: Error) => setError(cause.message));
  }, []);

  useEffect(load, [load]);

  if (error) return <Alert text={error} />;
  if (!items) return <Loading />;
  if (!items.length) return <p className="text-sm text-text-1">Жалоб нет.</p>;

  return (
    <ul className="space-y-3">
      {items.map((item) => (
        <li
          key={item.id}
          className="rounded-2xl border border-glass-brd bg-glass p-4"
        >
          <p className="text-sm font-medium text-text-0">
            {item.product.name}{" "}
            <span className="font-mono text-xs text-text-2">
              {item.product.barcode}
            </span>
          </p>
          <p className="mt-1 text-sm text-text-1">{item.comment}</p>
          <p className="mt-1 text-xs text-text-2">
            {item.author?.name ?? "аноним"} ·{" "}
            {new Date(item.createdAt).toLocaleDateString("ru-RU")}
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => void decideWellnessReport(item.id, true).then(load)}
              className="rounded-xl bg-magenta px-4 py-2 text-sm font-medium text-bg-0"
            >
              Принять
            </button>
            <button
              type="button"
              onClick={() =>
                void decideWellnessReport(item.id, false).then(load)
              }
              className="rounded-xl border border-glass-brd px-4 py-2 text-sm text-text-0"
            >
              Отклонить
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}

function CatalogTab() {
  const [items, setItems] = useState<WellnessIngredientDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState({
    key: "",
    nameRu: "",
    aliases: "",
    class: "other" as WellnessIngredientClass,
  });

  const load = useCallback(() => {
    getAdminWellnessIngredients()
      .then(setItems)
      .catch((cause: Error) => setError(cause.message));
  }, []);

  useEffect(load, [load]);

  if (error) return <Alert text={error} />;
  if (!items) return <Loading />;

  return (
    <div className="space-y-6">
      <form
        className="rounded-2xl border border-glass-brd bg-glass p-4"
        onSubmit={(event) => {
          event.preventDefault();
          void saveWellnessIngredient({
            key: draft.key,
            nameRu: draft.nameRu,
            aliases: draft.aliases
              .split(",")
              .map((value) => value.trim())
              .filter(Boolean),
            class: draft.class,
            severity: "contains",
          })
            .then(() => {
              setDraft({ key: "", nameRu: "", aliases: "", class: "other" });
              load();
            })
            .catch((cause: Error) => setError(cause.message));
        }}
      >
        <p className="font-display text-lg font-bold text-text-0">
          Добавить запись
        </p>
        <p className="mt-1 text-sm text-text-1">
          Алиасы — через запятую, ровно как их печатают на этикетках. Пока
          алиаса нет, сканер этот ингредиент не найдёт.
        </p>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field
            id="ing-key"
            label="Ключ"
            value={draft.key}
            onChange={(value) => setDraft({ ...draft, key: value })}
          />
          <Field
            id="ing-name"
            label="Название"
            value={draft.nameRu}
            onChange={(value) => setDraft({ ...draft, nameRu: value })}
          />
        </div>

        <Field
          id="ing-aliases"
          label="Алиасы через запятую"
          value={draft.aliases}
          onChange={(value) => setDraft({ ...draft, aliases: value })}
        />

        <label
          htmlFor="ing-class"
          className="mt-3 block text-sm font-medium text-text-0"
        >
          Класс
        </label>
        <select
          id="ing-class"
          value={draft.class}
          onChange={(event) =>
            setDraft({
              ...draft,
              class: event.target.value as WellnessIngredientClass,
            })
          }
          className="mt-1 w-full rounded-xl border border-glass-brd bg-bg-1 px-3 py-2 text-sm text-text-0"
        >
          {WELLNESS_INGREDIENT_CLASSES.map((value) => (
            <option key={value} value={value}>
              {ingredientClassLabel(value)}
            </option>
          ))}
        </select>

        <button
          type="submit"
          disabled={!draft.key.trim() || !draft.nameRu.trim()}
          className="mt-3 rounded-xl bg-magenta px-4 py-2 text-sm font-medium text-bg-0 disabled:opacity-50"
        >
          Сохранить
        </button>
      </form>

      <p className="text-sm text-text-1">Записей в справочнике: {items.length}</p>

      <ul className="space-y-2">
        {items.map((item) => (
          <li
            key={item.id}
            className="rounded-xl border border-glass-brd px-3 py-2"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm text-text-0">
                  {item.nameRu}
                  {item.eNumber && (
                    <span className="ml-2 font-mono text-xs text-text-2">
                      {item.eNumber}
                    </span>
                  )}
                </p>
                <p className="text-xs text-text-2">
                  {ingredientClassLabel(item.class)} · {item.severity} ·{" "}
                  {item.aliases.join(", ")}
                </p>
                {item.note && (
                  <p className="mt-1 text-xs text-text-1">{item.note}</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => {
                  if (window.confirm(`Удалить «${item.nameRu}»?`)) {
                    void deleteWellnessIngredient(item.id).then(load);
                  }
                }}
                className="shrink-0 text-xs text-text-1 underline"
              >
                Удалить
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="mt-3">
      <label htmlFor={id} className="block text-sm font-medium text-text-0">
        {label}
      </label>
      <input
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full rounded-xl border border-glass-brd bg-bg-1 px-3 py-2 text-sm text-text-0"
      />
    </div>
  );
}

function Loading() {
  return (
    <p role="status" className="text-sm text-text-1">
      Загружаем…
    </p>
  );
}

function Alert({ text }: { text: string }) {
  return (
    <p role="alert" className="text-sm text-magenta">
      {text}
    </p>
  );
}

/**
 * Рецепты. Добавляются сидом, а из админки ими управляют: публикуют, снимают
 * с публикации и удаляют. Пока рецепт в черновике, в сервисе его не видно.
 */
function RecipesTab() {
  const [items, setItems] = useState<AdminWellnessRecipe[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    getAdminWellnessRecipes()
      .then(setItems)
      .catch((cause: Error) => setError(cause.message));
  }, []);

  useEffect(load, [load]);

  if (error) return <Alert text={error} />;
  if (!items) return <Loading />;

  return (
    <div className="space-y-4">
      <ImportBox onDone={load} onError={setError} />
      {!items.length ? (
        <p className="text-sm text-text-1">Рецептов пока нет.</p>
      ) : (
        <RecipeList items={items} onChanged={load} />
      )}
    </div>
  );
}

/**
 * Импорт книги с gitabase. Отдельной коробкой и с предупреждением: это
 * выкачивание чужого издания, и запускать его должен человек, понимающий, на
 * каком основании книга у нас появляется.
 */
function ImportBox({
  onDone,
  onError,
}: {
  onDone: () => void;
  onError: (text: string) => void;
}) {
  const [book, setBook] = useState("CB1");
  const [chapter, setChapter] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  return (
    <div className="rounded-2xl border border-glass-brd bg-glass p-4">
      <p className="font-display text-base font-bold text-text-0">
        Импорт книги с gitabase
      </p>
      <p className="mt-1 text-sm text-text-1">
        Рецепты лягут черновиками с указанием книги и ссылкой на оригинал.
        Публикует их человек: разбор чужой вёрстки не бывает безошибочным.
        Запускайте, только если знаете, на каком основании книга у нас
        появляется.
      </p>

      <div className="mt-3 flex flex-wrap items-end gap-3">
        <label className="text-sm text-text-1">
          Книга
          <input
            value={book}
            onChange={(event) => setBook(event.target.value)}
            className="ml-2 w-24 rounded-xl border border-glass-brd bg-bg-1 px-3 py-2 font-mono text-sm text-text-0"
          />
        </label>
        <label className="text-sm text-text-1">
          Глава (пусто — вся книга)
          <input
            value={chapter}
            inputMode="numeric"
            onChange={(event) => setChapter(event.target.value)}
            className="ml-2 w-24 rounded-xl border border-glass-brd bg-bg-1 px-3 py-2 font-mono text-sm text-text-0"
          />
        </label>
        <button
          type="button"
          disabled={busy || !book.trim()}
          onClick={() => {
            setBusy(true);
            setDone(null);
            void importWellnessRecipes(
              book.trim(),
              chapter.trim() ? Number(chapter) : undefined,
            )
              .then((outcome) => {
                setDone(
                  `Глав: ${outcome.chapters}, принесено: ${outcome.imported}, пропущено: ${outcome.skipped}`,
                );
                onDone();
              })
              .catch((cause: Error) => onError(cause.message))
              .finally(() => setBusy(false));
          }}
          className="rounded-xl bg-magenta px-4 py-2 text-sm font-medium text-bg-0 disabled:opacity-50"
        >
          {busy ? "Импортируем…" : "Импортировать"}
        </button>
      </div>

      {done && (
        <p role="status" className="mt-2 text-sm text-cyan">
          {done}
        </p>
      )}
    </div>
  );
}

function RecipeList({
  items,
  onChanged,
}: {
  items: AdminWellnessRecipe[];
  onChanged: () => void;
}) {
  const load = onChanged;
  return (
    <ul className="space-y-2">
      {items.map((recipe) => (
        <li
          key={recipe.id}
          className="rounded-2xl border border-glass-brd bg-glass p-4"
        >
          <p className="text-sm font-medium text-text-0">{recipe.title}</p>
          <p className="font-mono text-xs text-text-2">{recipe.slug}</p>
          {recipe.description && (
            <p className="mt-1 text-sm text-text-1">{recipe.description}</p>
          )}
          <p className="mt-1 text-xs text-text-2">
            {recipe.ingredients.length} ингредиентов
            {recipe.source ? ` · источник: ${recipe.source}` : ""}
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                const next =
                  recipe.status === "published" ? "draft" : "published";
                void setWellnessRecipeStatus(recipe.id, next).then(load);
              }}
              className="rounded-xl border border-glass-brd px-4 py-2 text-sm text-text-0"
            >
              {recipe.status === "published" ? "Снять с публикации" : "Опубликовать"}
            </button>
            <span className="text-xs text-text-2">{recipe.status}</span>
            <button
              type="button"
              onClick={() => {
                if (window.confirm(`Удалить рецепт «${recipe.title}»?`)) {
                  void deleteWellnessRecipe(recipe.id).then(load);
                }
              }}
              className="ml-auto text-xs text-text-1 underline"
            >
              Удалить
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}
