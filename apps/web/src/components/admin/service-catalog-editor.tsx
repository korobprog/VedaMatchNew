"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import type {
  AdminServiceCardDto,
  ServiceStatus,
  UpdateAdminServiceRequest,
} from "@vedamatch/shared";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  createAdminService,
  updateAdminService,
} from "@/lib/catalog-admin-api";

const STATUS_LABELS: Record<ServiceStatus, string> = {
  active: "Работает",
  coming_soon: "Скоро",
  disabled: "Выключен",
};

/** Флаги видимости по этапам — в том порядке, в каком человек проходит путь. */
const STAGE_FLAGS = [
  { key: "seekerVisible", label: "Ищущий" },
  { key: "practitionerVisible", label: "Практикующий" },
  { key: "yogiVisible", label: "Йог" },
  { key: "devoteeSelfIdentifiedVisible", label: "Преданный (сам отметил)" },
  { key: "devoteeVerifiedVisible", label: "Преданный (подтверждён)" },
] as const;

const field =
  "mt-1 w-full rounded-xl border border-glass-brd bg-bg-1 px-3 py-2 text-sm text-text-0 placeholder:text-text-2";

export function ServiceCatalogEditor({
  services,
}: {
  services: AdminServiceCardDto[];
}) {
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      <CreateServiceForm />

      <ul className="space-y-3">
        {services.map((service) => (
          <li
            key={service.id}
            className="glass rounded-2xl border border-glass-brd p-4"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-display font-semibold text-text-0">
                  {service.name}
                  <span className="ml-2 rounded-full border border-glass-brd px-2 py-0.5 text-xs font-normal text-text-2">
                    {STATUS_LABELS[service.status]}
                  </span>
                </p>
                <p className="mt-0.5 font-mono text-xs text-text-2">
                  {service.slug} · {service.url} · порядок {service.sortOrder} ·{" "}
                  {service.category}
                  {service.personalAccessCount > 0 &&
                    ` · персональный доступ: ${service.personalAccessCount}`}
                </p>
                <p className="mt-1 text-sm text-text-1">
                  {service.description}
                </p>
              </div>
              <button
                type="button"
                onClick={() =>
                  setOpenId(openId === service.id ? null : service.id)
                }
                aria-expanded={openId === service.id}
                className="flex min-h-9 shrink-0 items-center rounded-xl border border-glass-brd px-3 py-1.5 text-sm text-text-1 hover:text-text-0"
              >
                {openId === service.id ? "Свернуть" : "Править"}
              </button>
            </div>

            {openId === service.id && <ServiceForm service={service} />}
          </li>
        ))}
      </ul>
    </div>
  );
}

function ServiceForm({ service }: { service: AdminServiceCardDto }) {
  const { pending, error, saved, submit } = useCatalogRequest();

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const body: UpdateAdminServiceRequest = {
      name: String(data.get("name") ?? "").trim(),
      nameEn: String(data.get("nameEn") ?? "").trim() || null,
      description: String(data.get("description") ?? "").trim(),
      url: String(data.get("url") ?? "").trim(),
      iconUrl: String(data.get("iconUrl") ?? "").trim() || null,
      category: String(data.get("category") ?? "").trim(),
      status: String(data.get("status") ?? "") as ServiceStatus,
      sortOrder: Number(data.get("sortOrder") ?? service.sortOrder),
      public: data.get("public") === "on",
      seekerVisible: data.get("seekerVisible") === "on",
      practitionerVisible: data.get("practitionerVisible") === "on",
      yogiVisible: data.get("yogiVisible") === "on",
      devoteeSelfIdentifiedVisible:
        data.get("devoteeSelfIdentifiedVisible") === "on",
      devoteeVerifiedVisible: data.get("devoteeVerifiedVisible") === "on",
    };
    await submit(() => updateAdminService(service.id, body));
  }

  return (
    <form onSubmit={onSubmit} className="mt-4 space-y-4 border-t border-glass-brd pt-4">
      {error && <Alert tone="error">{error}</Alert>}
      {saved && <Alert tone="success">Карточка сохранена.</Alert>}

      <div className="grid gap-3 sm:grid-cols-2">
        <Text name="name" label="Название" defaultValue={service.name} />
        <Text
          name="nameEn"
          label="Название (en)"
          defaultValue={service.nameEn ?? ""}
          placeholder="показывать русское"
        />
        <Text name="category" label="Категория" defaultValue={service.category} />
        <Text name="url" label="Адрес" defaultValue={service.url} />
        <Text
          name="iconUrl"
          label="Иконка (URL)"
          defaultValue={service.iconUrl ?? ""}
        />
        <label className="block text-sm font-medium text-text-1">
          Статус
          <select name="status" defaultValue={service.status} className={field}>
            {(Object.keys(STATUS_LABELS) as ServiceStatus[]).map((status) => (
              <option key={status} value={status}>
                {STATUS_LABELS[status]}
              </option>
            ))}
          </select>
        </label>
        <Text
          name="sortOrder"
          label="Порядок"
          type="number"
          defaultValue={String(service.sortOrder)}
        />
      </div>

      <label className="block text-sm font-medium text-text-1">
        Описание
        <textarea
          name="description"
          defaultValue={service.description}
          rows={2}
          className={field}
        />
      </label>

      <fieldset className="rounded-xl border border-glass-brd p-3">
        <legend className="px-1 text-sm font-medium text-text-1">
          Кому виден
        </legend>
        <label className="flex items-center gap-2 text-sm text-text-1">
          <input
            type="checkbox"
            name="public"
            defaultChecked={service.public}
          />
          Всем вошедшим
        </label>
        <p className="mt-1.5 mb-2 text-xs text-text-2">
          Со снятой галочкой сервис виден только по этапу или персональному
          доступу.
        </p>
        <ul className="grid gap-1.5 sm:grid-cols-2">
          {STAGE_FLAGS.map((flag) => (
            <li key={flag.key}>
              <label className="flex items-center gap-2 text-sm text-text-1">
                <input
                  type="checkbox"
                  name={flag.key}
                  defaultChecked={service[flag.key]}
                />
                {flag.label}
              </label>
            </li>
          ))}
        </ul>
      </fieldset>

      <Button type="submit" loading={pending}>
        Сохранить карточку
      </Button>
    </form>
  );
}

function CreateServiceForm() {
  const { pending, error, submit } = useCatalogRequest();
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-xl border border-glass-brd px-3 py-2 text-sm text-text-1 hover:text-text-0"
      >
        Добавить сервис
      </button>
    );
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const ok = await submit(() =>
      createAdminService({
        slug: String(data.get("slug") ?? "").trim(),
        name: String(data.get("name") ?? "").trim(),
        description: String(data.get("description") ?? "").trim(),
        url: String(data.get("url") ?? "").trim(),
        category: String(data.get("category") ?? "").trim(),
        status: String(data.get("status") ?? "coming_soon") as ServiceStatus,
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
      <h2 className="font-display font-semibold text-text-0">Новый сервис</h2>
      <p className="text-sm text-text-1">
        Карточка появится в сетке портала. Со статусом «Скоро» её можно завести
        заранее — до того, как сервис написан.
      </p>
      {error && <Alert tone="error">{error}</Alert>}
      <div className="grid gap-3 sm:grid-cols-2">
        <Text name="slug" label="Слаг" required placeholder="devotee-space" />
        <Text name="name" label="Название" required />
        <Text name="url" label="Адрес" required placeholder="/devotee-space" />
        <Text name="category" label="Категория" required placeholder="community" />
        <label className="block text-sm font-medium text-text-1">
          Статус
          <select name="status" defaultValue="coming_soon" className={field}>
            {(Object.keys(STATUS_LABELS) as ServiceStatus[]).map((status) => (
              <option key={status} value={status}>
                {STATUS_LABELS[status]}
              </option>
            ))}
          </select>
        </label>
        <Text name="sortOrder" label="Порядок" type="number" defaultValue="0" />
      </div>
      <label className="block text-sm font-medium text-text-1">
        Описание
        <textarea name="description" required rows={2} className={field} />
      </label>
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

function Text({
  name,
  label,
  type = "text",
  required,
  defaultValue,
  placeholder,
}: {
  name: string;
  label: string;
  type?: string;
  required?: boolean;
  defaultValue?: string;
  placeholder?: string;
}) {
  return (
    <label className="block text-sm font-medium text-text-1">
      {label}
      <input
        name={name}
        type={type}
        required={required}
        defaultValue={defaultValue}
        placeholder={placeholder}
        className={field}
      />
    </label>
  );
}

function useCatalogRequest() {
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
