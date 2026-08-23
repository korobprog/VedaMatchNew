import type {
  RewardsLedgerType,
  RewardsReferralStatus,
} from "@vedamatch/shared";
import { plural } from "@/lib/plural";

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

/** Строка сервиса в тексте приглашения: имя из каталога и короткая суть. */
export interface InviteService {
  name: string;
  tagline: string;
}

/**
 * Готовое приглашение для мессенджера. Собирается из каталога сервисов, а не
 * пишется вторым списком: имена правятся в админке, и захардкоженный здесь
 * перечень разошёлся бы с порталом при первом же переименовании.
 *
 * Формат — обычный текст без разметки: он уезжает в Telegram, WhatsApp, СМС
 * и почту одинаково, а звёздочки жирного в половине из них останутся
 * звёздочками.
 */
export function buildInviteMessage(params: {
  link: string;
  services: InviteService[];
  /** Сколько баллов получит приглашённый. Из настроек, не из константы. */
  welcomePoints: number;
}): string {
  const lines = [
    "Заходи в VedaMatch — портал для практикующих. Один вход, всё в одном месте:",
    "",
    ...params.services.map(
      (service) =>
        `• ${service.name}${separator(service.tagline)}${lowerFirst(service.tagline)}`,
    ),
  ];

  if (params.welcomePoints > 0) {
    lines.push(
      "",
      `Регистрация по моей ссылке — сразу ${params.welcomePoints} ${plural(params.welcomePoints, "балл", "балла", "баллов")} на счёт:`,
    );
  } else {
    lines.push("", "Моя ссылка для регистрации:");
  }
  lines.push(params.link);

  return lines.join("\n");
}

/**
 * Знак между названием сервиса и его сутью. Тэглайны написаны свободно: у
 * одних внутри тире («Совместимость — это не вайб, а расчёт»), у других
 * двоеточие («Переписка портала: диалоги, группы и каналы общин»). Один и
 * тот же знак на все строки даёт «Общение: переписка портала: диалоги…» —
 * читается как список внутри списка. Берём тот, которого в тэглайне нет.
 */
function separator(tagline: string): string {
  return tagline.includes(":") ? " — " : ": ";
}

/**
 * Тэглайн идёт после знака и начинается со строчной: в каталоге он написан
 * как самостоятельная фраза с заглавной, и в строке списка выглядел бы
 * вторым предложением. Аббревиатуры и названия не трогаем — у них вторая
 * буква тоже заглавная.
 */
function lowerFirst(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  if (trimmed[1] && trimmed[1] === trimmed[1].toUpperCase() && /[A-ZА-ЯЁ]/.test(trimmed[1])) {
    return trimmed;
  }
  return trimmed[0].toLowerCase() + trimmed.slice(1);
}
