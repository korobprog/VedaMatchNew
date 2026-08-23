"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import type { AdminRewardsSettingsDto } from "@vedamatch/shared";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { updateRewardsSettings } from "@/lib/rewards-api";

/**
 * Номиналы правятся здесь, а не константами в коде: экономика беты меняется
 * быстрее релизов. Подпись под каждым полем объясняет последствие правки —
 * «30» само по себе ничего не говорит тому, кто открыл раздел впервые.
 */
const FIELDS: Array<{
  key: keyof Omit<AdminRewardsSettingsDto, "updatedAt">;
  label: string;
  hint: string;
}> = [
  {
    key: "levelOnePoints",
    label: "Баллы за приглашённого (уровень 1)",
    hint: "Начисляются, когда приглашённый выполнил условие.",
  },
  {
    key: "levelTwoPoints",
    label: "Баллы за приглашённого вторым уровнем",
    hint: "Тому, кто привёл пригласившего. Глубже второго уровня начислений нет.",
  },
  {
    key: "welcomePoints",
    label: "Приветственные баллы приглашённому",
    hint: "Единственное мгновенное начисление в бете — потому и небольшое.",
  },
  {
    key: "monthlyCapPoints",
    label: "Потолок начислений в месяц на человека",
    hint: "0 — без ограничения. Срезанное сверху пишется в журнал подозрений.",
  },
  {
    key: "accrualDelayHours",
    label: "Задержка начисления, часов",
    hint: "Отсчитывается от момента, когда условие выполнено.",
  },
  {
    key: "qualifyMinDays",
    label: "Дней с регистрации до начисления",
    hint: "Раньше этого срока приглашённый не засчитывается, что бы он ни сделал.",
  },
];

const field =
  "mt-1 w-full rounded-xl border border-glass-brd bg-bg-1 px-3 py-2 text-sm text-text-0";

export function RewardsSettingsForm({
  settings,
}: {
  settings: AdminRewardsSettingsDto;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setPending(true);
    setError(null);
    setSaved(false);
    try {
      await updateRewardsSettings(
        Object.fromEntries(
          FIELDS.map((item) => [item.key, Number(data.get(item.key) ?? 0)]),
        ),
      );
      setSaved(true);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось сохранить");
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="glass space-y-5 rounded-2xl border border-glass-brd p-4"
    >
      {error && <Alert tone="error">{error}</Alert>}
      {saved && <Alert tone="success">Настройки сохранены.</Alert>}

      <div className="grid gap-4 sm:grid-cols-2">
        {FIELDS.map((item) => (
          <label
            key={item.key}
            className="block text-sm font-medium text-text-1"
          >
            {item.label}
            <input
              name={item.key}
              type="number"
              min={0}
              step={1}
              defaultValue={settings[item.key]}
              className={field}
            />
            <span className="mt-1 block text-xs font-normal text-text-1">
              {item.hint}
            </span>
          </label>
        ))}
      </div>

      <Button type="submit" disabled={pending}>
        {pending ? "Сохраняем…" : "Сохранить"}
      </Button>
    </form>
  );
}
