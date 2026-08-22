"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import type {
  ContactsAdminTagDto,
  ContactsTagKind,
} from "@vedamatch/shared";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  createContactsTag,
  deleteContactsTag,
  updateContactsTag,
} from "@/lib/chat-people-admin-api";

export const KIND_LABELS: Record<ContactsTagKind, string> = {
  service: "Служение",
  profession: "Профессия",
  skill: "Навык",
  interest: "Интерес",
};

const field =
  "mt-1 w-full rounded-xl border border-glass-brd bg-bg-1 px-3 py-2 text-sm text-text-0 placeholder:text-text-2";

/**
 * Справочник тегов. До сих пор менялся только сидом, хотя схема прямо
 * обещает обратное: «новый вид служения не требует миграции БД».
 */
export function PeopleTagEditor({ tags }: { tags: ContactsAdminTagDto[] }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const grouped = groupByKind(tags);

  return (
    <div className="space-y-6">
      <CreateTagForm />

      {grouped.map(([kind, items]) => (
        <section key={kind}>
          <h2 className="mb-2 font-display text-lg font-semibold text-text-0">
            {KIND_LABELS[kind]}
          </h2>
          <ul className="space-y-2">
            {items.map((tag) => (
              <li
                key={tag.id}
                className="glass rounded-2xl border border-glass-brd p-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm text-text-0">
                    {tag.nameRu}
                    <span className="ml-2 font-mono text-xs text-text-2">
                      {tag.slug} · порядок {tag.sortOrder} · на карточках:{" "}
                      {tag.profilesCount}
                    </span>
                    {tag.isSystem && (
                      <span className="ml-2 rounded-full border border-glass-brd px-2 py-0.5 text-xs text-text-2">
                        системный
                      </span>
                    )}
                  </span>
                  <button
                    type="button"
                    onClick={() => setOpenId(openId === tag.id ? null : tag.id)}
                    aria-expanded={openId === tag.id}
                    className="flex min-h-9 shrink-0 items-center rounded-lg border border-glass-brd px-3 py-1 text-xs text-text-1 hover:text-text-0"
                  >
                    {openId === tag.id ? "Закрыть" : "Править"}
                  </button>
                </div>
                {openId === tag.id && <TagForm tag={tag} />}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function TagForm({ tag }: { tag: ContactsAdminTagDto }) {
  const { pending, error, saved, submit } = useTagRequest();

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    await submit(() =>
      updateContactsTag(tag.id, {
        nameRu: String(data.get("nameRu") ?? "").trim(),
        kind: String(data.get("kind") ?? tag.kind) as ContactsTagKind,
        sortOrder: Number(data.get("sortOrder") ?? tag.sortOrder),
      }),
    );
  }

  async function onDelete() {
    const warning =
      tag.profilesCount > 0
        ? `Тег стоит на ${tag.profilesCount} карточках — он с них снимется. Удалить?`
        : "Удалить тег?";
    if (!window.confirm(warning)) return;
    await submit(() => deleteContactsTag(tag.id));
  }

  return (
    <form
      onSubmit={onSubmit}
      className="mt-3 space-y-3 border-t border-glass-brd pt-3"
    >
      {error && <Alert tone="error">{error}</Alert>}
      {saved && <Alert tone="success">Тег сохранён.</Alert>}
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block text-sm font-medium text-text-1">
          Название
          <input name="nameRu" defaultValue={tag.nameRu} className={field} />
        </label>
        <label className="block text-sm font-medium text-text-1">
          Вид
          <select name="kind" defaultValue={tag.kind} className={field}>
            {(Object.keys(KIND_LABELS) as ContactsTagKind[]).map((kind) => (
              <option key={kind} value={kind}>
                {KIND_LABELS[kind]}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm font-medium text-text-1">
          Порядок
          <input
            name="sortOrder"
            type="number"
            defaultValue={String(tag.sortOrder)}
            className={field}
          />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" loading={pending}>
          Сохранить
        </Button>
        {tag.isSystem ? (
          <span className="text-xs text-text-2">
            Системный тег приезжает сидом — удалить его нельзя, вернётся.
          </span>
        ) : (
          <button
            type="button"
            disabled={pending}
            onClick={() => void onDelete()}
            className="rounded-xl border border-glass-brd px-3 py-2 text-sm text-text-1 hover:text-text-0 disabled:opacity-50"
          >
            Удалить
          </button>
        )}
      </div>
    </form>
  );
}

function CreateTagForm() {
  const { pending, error, submit } = useTagRequest();
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-xl border border-glass-brd px-3 py-2 text-sm text-text-1 hover:text-text-0"
      >
        Добавить тег
      </button>
    );
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const ok = await submit(() =>
      createContactsTag({
        slug: String(data.get("slug") ?? "").trim(),
        nameRu: String(data.get("nameRu") ?? "").trim(),
        kind: String(data.get("kind") ?? "service") as ContactsTagKind,
        sortOrder: Number(data.get("sortOrder") ?? 0),
      }),
    );
    if (ok) setOpen(false);
  }

  return (
    <form
      onSubmit={onSubmit}
      className="glass space-y-3 rounded-2xl border border-glass-brd p-4"
    >
      <h2 className="font-display font-semibold text-text-0">Новый тег</h2>
      {error && <Alert tone="error">{error}</Alert>}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm font-medium text-text-1">
          Слаг
          <input
            name="slug"
            required
            placeholder="prasad-cooking"
            className={field}
          />
        </label>
        <label className="block text-sm font-medium text-text-1">
          Название
          <input name="nameRu" required className={field} />
        </label>
        <label className="block text-sm font-medium text-text-1">
          Вид
          <select name="kind" defaultValue="service" className={field}>
            {(Object.keys(KIND_LABELS) as ContactsTagKind[]).map((kind) => (
              <option key={kind} value={kind}>
                {KIND_LABELS[kind]}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm font-medium text-text-1">
          Порядок
          <input name="sortOrder" type="number" defaultValue="0" className={field} />
        </label>
      </div>
      <div className="flex gap-2">
        <Button type="submit" loading={pending}>
          Создать
        </Button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-xl border border-glass-brd px-3 py-2 text-sm text-text-1 hover:text-text-0"
        >
          Отмена
        </button>
      </div>
    </form>
  );
}

/** Теги показываются по видам: так их и выбирают в самой карточке. */
function groupByKind(
  tags: ContactsAdminTagDto[],
): Array<[ContactsTagKind, ContactsAdminTagDto[]]> {
  const kinds = Object.keys(KIND_LABELS) as ContactsTagKind[];
  return kinds
    .map(
      (kind): [ContactsTagKind, ContactsAdminTagDto[]] => [
        kind,
        tags.filter((tag) => tag.kind === kind),
      ],
    )
    .filter(([, items]) => items.length > 0);
}

function useTagRequest() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function submit(action: () => Promise<unknown>): Promise<boolean> {
    setPending(true);
    setError(null);
    setSaved(false);
    try {
      await action();
      setSaved(true);
      router.refresh();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось сохранить");
      return false;
    } finally {
      setPending(false);
    }
  }

  return { pending, error, saved, submit };
}
