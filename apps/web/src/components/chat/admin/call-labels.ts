import type { ChatCallStatus } from "@vedamatch/shared";

/**
 * Подписи раздела «Звонки» в админке. Чистые функции без React — их можно
 * проверить тестом отдельно от таблицы, которая их показывает.
 */

const STATUS_LABELS: Record<ChatCallStatus, string> = {
  ringing: "Дозвон",
  accepted: "Идёт",
  ended: "Состоялся",
  missed: "Пропущен",
  declined: "Отклонён",
  cancelled: "Отменён",
  failed: "Оборвался",
};

export function callStatusLabel(status: ChatCallStatus): string {
  return STATUS_LABELS[status] ?? status;
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/**
 * Длительность из секунд: «m:ss» до часа, «h:mm:ss» дальше. Отрицательное
 * и нечисловое считаем нулём — часы на клиентах бывают рассинхронены.
 */
export function formatSeconds(totalSeconds: number): string {
  const total = Number.isFinite(totalSeconds) ? Math.max(0, Math.floor(totalSeconds)) : 0;
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (hours > 0) return `${hours}:${pad(minutes)}:${pad(seconds)}`;
  return `${minutes}:${pad(seconds)}`;
}

/** Сколько длился разговор: от ответа до конца. «—», если чего-то нет. */
export function callDurationLabel(
  answeredAt: string | null | undefined,
  endedAt: string | null | undefined,
): string {
  if (!answeredAt || !endedAt) return "—";
  const start = Date.parse(answeredAt);
  const end = Date.parse(endedAt);
  if (Number.isNaN(start) || Number.isNaN(end)) return "—";
  return formatSeconds((end - start) / 1000);
}

/** Доля в процентах, округлённая до целого. «—», когда доля неизвестна. */
export function percentLabel(share: number | null | undefined): string {
  if (share === null || share === undefined || !Number.isFinite(share)) return "—";
  return `${Math.round(share * 100)} %`;
}
