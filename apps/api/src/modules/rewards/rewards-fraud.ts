import type { RewardsFraudReason } from '@vedamatch/shared';

/**
 * Самоприглашение. Самый дешёвый способ накрутить программу — завести второй
 * аккаунт на плюс-адрес той же почты и пройти по собственной ссылке, поэтому
 * проверки идут по трём независимым следам: адрес, устройство и IP.
 *
 * Совпадение не запрещает регистрацию — оно отменяет начисление и пишет
 * строку в журнал подозрений. Ложное срабатывание тут дешевле пропуска:
 * муж и жена с одного ноутбука разберутся через поддержку, а ферма аккаунтов
 * — нет.
 */

export interface SignupSignals {
  userId: string;
  email: string;
  ip: string | null;
  /** Отпечаток устройства из cookie; `null` — cookie не доехала. */
  deviceId: string | null;
  registeredAt: Date;
}

/** Сколько совпадение IP считается уликой. */
export const IP_MATCH_WINDOW_HOURS = 24;

/**
 * Канонический вид адреса: `ivan+ref2@gmail.com` и `ivan@gmail.com` — одна
 * почта. Точки в локальной части не трогаем: они значимы у большинства
 * провайдеров, и «одинаковость» по ним дала бы ложные срабатывания на
 * однофамильцах в корпоративном домене.
 */
export function emailIdentity(email: string): string {
  const trimmed = email.trim().toLowerCase();
  const at = trimmed.lastIndexOf('@');
  if (at <= 0) return trimmed;
  const local = trimmed.slice(0, at);
  const domain = trimmed.slice(at + 1);
  const plus = local.indexOf('+');
  const base = plus >= 0 ? local.slice(0, plus) : local;
  return `${base || local}@${domain}`;
}

/**
 * Почему начисление не создаётся; `null` — следов самоприглашения нет.
 *
 * Порядок причин — от бесспорной к вероятностной: в журнале должна быть
 * названа самая сильная улика, а не первая попавшаяся.
 */
export function detectSelfInvite(
  inviter: SignupSignals,
  invitee: SignupSignals,
  windowHours: number = IP_MATCH_WINDOW_HOURS,
): RewardsFraudReason | null {
  if (inviter.userId === invitee.userId) return 'self_invite';
  if (emailIdentity(inviter.email) === emailIdentity(invitee.email))
    return 'email_alias';
  if (
    inviter.deviceId &&
    invitee.deviceId &&
    inviter.deviceId === invitee.deviceId
  )
    return 'device_match';
  if (inviter.ip && invitee.ip && inviter.ip === invitee.ip) {
    const gapMs = Math.abs(
      invitee.registeredAt.getTime() - inviter.registeredAt.getTime(),
    );
    if (gapMs <= Math.max(0, windowHours) * 60 * 60 * 1000) return 'ip_match';
  }
  return null;
}

/** Человекочитаемая улика для журнала: что именно совпало. */
export function describeFraudEvidence(
  reason: RewardsFraudReason,
  inviter: SignupSignals,
  invitee: SignupSignals,
): string {
  switch (reason) {
    case 'self_invite':
      return 'переход по собственной ссылке';
    case 'email_alias':
      return `почта ${emailIdentity(invitee.email)}`;
    case 'device_match':
      return `устройство ${invitee.deviceId ?? ''}`.trim();
    case 'ip_match':
      return `адрес ${invitee.ip ?? ''} в пределах ${IP_MATCH_WINDOW_HOURS} ч`.trim();
    case 'monthly_cap':
      return `месячный потолок пригласившего ${inviter.userId}`;
  }
}
