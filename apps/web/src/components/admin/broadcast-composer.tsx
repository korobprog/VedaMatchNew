"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BROADCAST_BODY_MAX_LENGTH,
  BROADCAST_TITLE_MAX_LENGTH,
} from "@vedamatch/shared";
import type {
  NotificationAudienceFilter,
  NotificationAudiencePreviewResponse,
  Role,
  SpiritualStage,
} from "@vedamatch/shared";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { roleLabels, stageLabels } from "@/lib/admin-labels";
import { describeAudience } from "@/lib/broadcast-labels";
import {
  createBroadcast,
  previewAudience,
  sendBroadcast,
} from "@/lib/broadcasts-api";

const STAGES: SpiritualStage[] = [
  "seeker",
  "practitioner",
  "yogi",
  "devotee",
];
const ROLES: Role[] = ["user", "admin", "service-admin"];

const field =
  "mt-1 w-full rounded-xl border border-glass-brd bg-bg-1 px-3 py-2 text-sm text-text-0 placeholder:text-text-2";

/**
 * Форма рассылки. Черновик и отправка — две разные кнопки: «сохранить, чтобы
 * перечитать» и «разослать всем» слишком по-разному стоят, чтобы прятать их
 * за одной.
 */
export function BroadcastComposer() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [url, setUrl] = useState("");
  const [important, setImportant] = useState(false);
  const [stages, setStages] = useState<SpiritualStage[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [payment, setPayment] = useState<"" | "paid" | "unpaid">("");
  const [withPushOnly, setWithPushOnly] = useState(false);

  const [preview, setPreview] =
    useState<NotificationAudiencePreviewResponse | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const audience: NotificationAudienceFilter = {
    ...(stages.length > 0 ? { stages } : {}),
    ...(roles.length > 0 ? { roles } : {}),
    ...(payment ? { payment } : {}),
    ...(withPushOnly ? { withPushOnly: true } : {}),
  };
  const ready = title.trim().length > 0 && body.trim().length > 0;

  function toggle<T>(list: T[], value: T, checked: boolean): T[] {
    setPreview(null);
    return checked ? [...list, value] : list.filter((item) => item !== value);
  }

  async function run(action: () => Promise<unknown>, message: string) {
    setPending(true);
    setError(null);
    setNotice(null);
    try {
      await action();
      setNotice(message);
      setTitle("");
      setBody("");
      setUrl("");
      setImportant(false);
      setPreview(null);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось выполнить");
    } finally {
      setPending(false);
    }
  }

  async function showPreview() {
    setPending(true);
    setError(null);
    try {
      setPreview(await previewAudience(audience));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось посчитать");
    } finally {
      setPending(false);
    }
  }

  function payload() {
    return {
      title: title.trim(),
      body: body.trim(),
      url: url.trim() || null,
      important,
      audience,
    };
  }

  async function saveDraft(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await run(() => createBroadcast(payload()), "Черновик сохранён.");
  }

  async function sendNow() {
    // Рассылку не отозвать: подтверждение здесь дешевле, чем извинение потом.
    const target = preview?.total;
    const confirmed = window.confirm(
      target
        ? `Отправить рассылку ${target} получателям?`
        : "Отправить рассылку выбранной аудитории?",
    );
    if (!confirmed) return;

    await run(async () => {
      const draft = await createBroadcast(payload());
      await sendBroadcast(draft.id);
    }, "Рассылка запущена.");
  }

  return (
    <form
      onSubmit={saveDraft}
      className="glass mb-8 space-y-4 rounded-2xl border border-glass-brd p-4"
    >
      <div>
        <h2 className="font-display font-semibold text-text-0">
          Новая рассылка
        </h2>
        <p className="mt-1 text-sm text-text-1">
          Уведомление попадает в колокольчик и уходит пушем тем, кто разрешил
          его в браузере. Отменить после отправки нельзя.
        </p>
      </div>

      {error && <Alert tone="error">{error}</Alert>}
      {notice && <Alert tone="success">{notice}</Alert>}

      <label className="block text-sm font-medium text-text-1">
        Заголовок
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          maxLength={BROADCAST_TITLE_MAX_LENGTH}
          className={field}
          placeholder="Плановые работы в воскресенье"
        />
      </label>

      <label className="block text-sm font-medium text-text-1">
        Текст
        <textarea
          value={body}
          onChange={(event) => setBody(event.target.value)}
          maxLength={BROADCAST_BODY_MAX_LENGTH}
          rows={4}
          className={field}
          placeholder="С 3:00 до 4:00 портал будет недоступен."
        />
        <span className="mt-1 block text-xs text-text-2">
          {body.length} / {BROADCAST_BODY_MAX_LENGTH}
        </span>
      </label>

      <label className="block text-sm font-medium text-text-1">
        Ссылка внутри портала
        <input
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          className={field}
          placeholder="/updates"
        />
        <span className="mt-1 block text-xs text-text-2">
          Начинается с «/». Пусто — уведомление ведёт в список уведомлений.
        </span>
      </label>

      <label className="flex items-start gap-2 text-sm text-text-1">
        <input
          type="checkbox"
          checked={important}
          onChange={(event) => setImportant(event.target.checked)}
          className="mt-1"
        />
        <span>
          Важное — попадёт в колокольчик даже тем, кто выключил объявления
          администрации. Пуш всё равно уйдёт только разрешившим.
        </span>
      </label>

      <fieldset className="rounded-xl border border-glass-brd p-3">
        <legend className="px-1 text-sm font-medium text-text-1">
          Кому отправить
        </legend>

        <p className="mb-3 text-sm text-text-1">{describeAudience(audience)}</p>

        <div className="grid gap-4 sm:grid-cols-2">
          <CheckboxGroup
            title="Этап"
            items={STAGES.map((stage) => ({
              value: stage,
              label: stageLabels[stage],
            }))}
            selected={stages}
            onToggle={(value, checked) =>
              setStages((current) => toggle(current, value, checked))
            }
          />
          <CheckboxGroup
            title="Роль"
            items={ROLES.map((role) => ({
              value: role,
              label: roleLabels[role],
            }))}
            selected={roles}
            onToggle={(value, checked) =>
              setRoles((current) => toggle(current, value, checked))
            }
          />
        </div>

        <label className="mt-3 block text-sm font-medium text-text-1">
          Оплата
          <select
            value={payment}
            onChange={(event) => {
              setPreview(null);
              setPayment(event.target.value as "" | "paid" | "unpaid");
            }}
            className={field}
          >
            <option value="">Неважно</option>
            <option value="paid">Платят</option>
            <option value="unpaid">Не платят</option>
          </select>
        </label>

        <label className="mt-3 flex items-center gap-2 text-sm text-text-1">
          <input
            type="checkbox"
            checked={withPushOnly}
            onChange={(event) => {
              setPreview(null);
              setWithPushOnly(event.target.checked);
            }}
          />
          Только те, у кого включён пуш в браузере
        </label>

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => void showPreview()}
            disabled={pending}
            className="rounded-xl border border-glass-brd px-3 py-2 text-sm text-text-1 hover:text-text-0 disabled:opacity-50"
          >
            Посчитать получателей
          </button>
          {preview && (
            <p className="text-sm text-text-1">
              Всего: <b className="text-text-0">{preview.total}</b> · получат
              пуш: <b className="text-text-0">{preview.withPush}</b> ·
              выключили категорию:{" "}
              <b className="text-text-0">{preview.optedOut}</b>
            </p>
          )}
        </div>
      </fieldset>

      <div className="flex flex-wrap gap-2">
        <Button type="submit" loading={pending} disabled={!ready}>
          Сохранить черновик
        </Button>
        <button
          type="button"
          onClick={() => void sendNow()}
          disabled={pending || !ready}
          className="rounded-xl border border-magenta/50 px-4 py-2 text-sm font-medium text-text-0 hover:bg-magenta/10 disabled:opacity-50"
        >
          Создать и отправить
        </button>
      </div>
    </form>
  );
}

function CheckboxGroup<T extends string>({
  title,
  items,
  selected,
  onToggle,
}: {
  title: string;
  items: Array<{ value: T; label: string }>;
  selected: T[];
  onToggle: (value: T, checked: boolean) => void;
}) {
  return (
    <fieldset>
      <legend className="mb-1.5 text-sm text-text-2">{title}</legend>
      <ul className="space-y-1">
        {items.map((item) => (
          <li key={item.value}>
            <label className="flex items-center gap-2 text-sm text-text-1">
              <input
                type="checkbox"
                checked={selected.includes(item.value)}
                onChange={(event) => onToggle(item.value, event.target.checked)}
              />
              {item.label}
            </label>
          </li>
        ))}
      </ul>
    </fieldset>
  );
}
