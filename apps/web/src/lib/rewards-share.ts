import type {
  RewardsLedgerType,
  RewardsReferralStatus,
} from "@vedamatch/shared";

/**
 * Тексты и ссылки экрана баллов. Формулировки собирает веб, а не API: он
 * знает и режим беты, и то, куда человек нажал, — сервер сообщает факты.
 */

/** Что человек отправляет другу вместе со ссылкой. */
export const REWARDS_SHARE_TEXT =
  "Заходи в VedaMatch — портал для практикующих: знакомства, объявления, общение и библиотека в одном месте.";

/**
 * Ссылка «поделиться» в мессенджере. Собираем руками, а не через
 * `navigator.share`: на десктопе его нет, а кнопка обязана работать везде.
 * Оба параметра кодируются — в тексте есть пробелы и тире.
 */
export function shareLink(
  target: "telegram" | "whatsapp",
  link: string,
  text: string = REWARDS_SHARE_TEXT,
): string {
  if (target === "telegram") {
    return `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(text)}`;
  }
  // WhatsApp принимает одну строку: ссылка идёт в конце, чтобы предпросмотр
  // цеплялся именно за неё.
  return `https://wa.me/?text=${encodeURIComponent(`${text} ${link}`)}`;
}

/** Подпись статуса приглашённого. Три состояния, как на экране. */
export const REFERRAL_STATUS_LABELS: Record<RewardsReferralStatus, string> = {
  registered: "Зарегистрирован",
  qualified: "Выполнил условие",
  awarded: "Начислено",
  rejected: "Не засчитан",
};

/** Подпись операции в истории. */
export const LEDGER_TYPE_LABELS: Record<RewardsLedgerType, string> = {
  welcome: "Приветственные баллы",
  referral_l1: "За приглашённого",
  referral_l2: "За приглашённого вторым уровнем",
  admin_revoke: "Отмена начисления",
  reserve: "Резерв под оплату",
  commit: "Списано на абонемент",
  release: "Резерв снят",
};

/**
 * Сумма со знаком для истории. Плюс проставляется явно: без него начисление
 * и списание отличаются одним минусом, который теряется при беглом чтении.
 */
export function formatLedgerAmount(amount: number): string {
  if (amount > 0) return `+${amount}`;
  return String(amount);
}

/**
 * Пояснение под балансом. В бете тратить некуда, и человек обязан узнать об
 * этом на самом экране, а не в поддержке: копится — не значит пропадёт.
 */
export function balanceNote(spendEnabled: boolean): string {
  return spendEnabled
    ? "Баллами можно закрыть часть стоимости абонемента."
    : "Баллы можно будет потратить на абонемент после завершения беты — они сохранятся.";
}
